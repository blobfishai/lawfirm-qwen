#!/usr/bin/env node
/**
 * Simulation runner: drives the Morgan Stanley (SIMULATED) CRM world with a grok-4.5 agent.
 *
 * Modes:
 *   node sim/run-simulation.mjs [--task <task_id>]   blobfish mode (default): runs a task from
 *                                                    the blobfish world via the MCP bridge and
 *                                                    scores it with the VCode verifier.
 *   node sim/run-simulation.mjs --local [scenario]   local mode: runs the scripted quote-to-cash
 *                                                    scenario against the local mock CRM MCP.
 */
import { readFileSync, existsSync, mkdirSync, appendFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { McpClient } from "./lib/mcp-client.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(readFileSync(join(ROOT, "config", "world.config.json"), "utf8"));

const argv = process.argv.slice(2);
const LOCAL = argv.includes("--local");
const taskFlag = argv.includes("--task") ? argv[argv.indexOf("--task") + 1] : null;
const jsonOutFlag = argv.includes("--json-out") ? argv[argv.indexOf("--json-out") + 1] : null;
const worldFileFlag = argv.includes("--world-file") ? argv[argv.indexOf("--world-file") + 1] : null;

function loadEnv() {
  const env = { ...process.env };
  try {
    for (const line of readFileSync(join(ROOT, ".env"), "utf8").split("\n")) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m && !(m[1] in process.env)) env[m[1]] = m[2];
    }
  } catch { /* no .env */ }
  return env;
}
const env = loadEnv();
const API_KEY = env.XAI_API_KEY;
if (!API_KEY) {
  console.error("XAI_API_KEY missing — copy .env.example to .env and set it.");
  process.exit(1);
}
const MODEL = env.XAI_MODEL ?? config.engine.model;

const LOG_DIR = join(ROOT, "sim", "logs");
mkdirSync(LOG_DIR, { recursive: true });
const LOG = join(LOG_DIR, `run-${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`);
const log = (obj) => appendFileSync(LOG, JSON.stringify(obj) + "\n");

const TRUNCATE = 8000;
const clip = (s) => (s.length > TRUNCATE ? s.slice(0, TRUNCATE) + `\n…[truncated ${s.length - TRUNCATE} chars]` : s);

async function chat(messages, tools) {
  const res = await fetch(`${config.engine.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, messages, tools, tool_choice: "auto", max_tokens: config.engine.maxCompletionTokens }),
  });
  if (!res.ok) throw new Error(`xAI API ${res.status}: ${await res.text()}`);
  return res.json();
}

/** Agentic loop: model <-> MCP tools until a final (non-tool) answer or turn cap.
 *  The cap is blobfish-style reference-relative when opts.maxTurns is supplied:
 *  a budget derived from the task's own reference walk length, so long-horizon
 *  tasks get proportionally long budgets and the cap never masquerades as a
 *  capability verdict. */
async function runAgent(mcp, llmTools, messages, opts = {}) {
  const maxTurns = opts.maxTurns ?? config.engine.maxAgentTurns;
  const usage = { prompt: 0, completion: 0, total: 0 };
  let toolCallCount = 0;
  let finalText = null;
  const guardTokens = Math.floor(config.engine.contextWindowTokens * config.engine.contextGuardRatio);

  for (let turn = 1; turn <= maxTurns; turn++) {
    const resp = await chat(messages, llmTools);
    const u = resp.usage ?? {};
    usage.prompt += u.prompt_tokens ?? 0;
    usage.completion += u.completion_tokens ?? 0;
    usage.total += u.total_tokens ?? 0;
    log({ type: "completion", turn, model: resp.model, usage: u });

    if ((u.prompt_tokens ?? 0) > guardTokens) {
      console.warn(`! Context guard: prompt ${u.prompt_tokens} > ${guardTokens} tokens (90% of ${config.engine.contextWindowTokens}); trimming oldest tool output`);
      const oldTool = messages.find((m) => m.role === "tool" && m.content !== "[trimmed]");
      if (oldTool) oldTool.content = "[trimmed]";
    }

    const msg = resp.choices[0].message;
    if (msg.reasoning_content) log({ type: "thinking", turn, content: String(msg.reasoning_content).slice(0, 4000) });
    messages.push({ role: "assistant", content: msg.content ?? "", tool_calls: msg.tool_calls });

    if (msg.tool_calls?.length) {
      for (const tc of msg.tool_calls) {
        let args = {};
        try { args = JSON.parse(tc.function.arguments || "{}"); } catch { /* leave empty */ }
        let resultText;
        try {
          const r = await mcp.callTool(tc.function.name, args, 180000); // world sub-agent tools can be slow
          resultText = r.text;
          toolCallCount++;
          console.log(`[turn ${turn}] ${tc.function.name}(${clip(JSON.stringify(args)).slice(0, 200)}) -> ${r.ok ? "ok" : "ERROR"}`);
        } catch (e) {
          resultText = `ERROR: ${e.message}`;
          console.log(`[turn ${turn}] ${tc.function.name} -> transport error: ${e.message}`);
        }
        log({ type: "tool", turn, name: tc.function.name, args, result: resultText });
        messages.push({ role: "tool", tool_call_id: tc.id, content: clip(resultText) });
      }
      continue;
    }

    finalText = msg.content;
    console.log(`\n=== Agent final answer (turn ${turn}) ===\n${finalText}\n`);
    log({ type: "final", turn, content: finalText });
    break;
  }
  return { usage, toolCallCount, finalText };
}

function printStats(usage, toolCallCount) {
  const cost = (usage.prompt / 1e6) * 2.0 + (usage.completion / 1e6) * 6.0; // grok-4.5 $/M, see config/models.json
  console.log(`=== Run stats ===`);
  console.log(`Model: ${MODEL} | tool calls: ${toolCallCount}`);
  console.log(`Tokens: prompt ${usage.prompt.toLocaleString()}, completion ${usage.completion.toLocaleString()} (context limit ${config.engine.contextWindowTokens.toLocaleString()})`);
  console.log(`Approx cost: $${cost.toFixed(4)} | transcript: ${LOG}`);
}

const taskField = (t, ...names) => names.map((n) => t[n]).find((v) => v !== undefined && v !== null);

async function mainBlobfish() {
  const worldPath = worldFileFlag
    ? worldFileFlag
    : existsSync(join(ROOT, config.blobfish.worldFile))
      ? join(ROOT, config.blobfish.worldFile)
      : join(ROOT, config.blobfish.previewWorldFile);
  if (!existsSync(worldPath)) {
    console.error(`No blobfish world file found (${config.blobfish.worldFile}). Run the generation job first, or use --local.`);
    process.exit(1);
  }
  const raw = JSON.parse(readFileSync(worldPath, "utf8"));
  const world = raw.world ?? raw;
  const tasks = world.tasks ?? [];
  if (!tasks.length) { console.error("World has no tasks."); process.exit(1); }

  const task = taskFlag ? tasks.find((t) => taskField(t, "task_id", "id") === taskFlag) : tasks[0];
  if (!task) { console.error(`Task '${taskFlag}' not found. Available: ${tasks.map((t) => taskField(t, "task_id", "id")).join(", ")}`); process.exit(1); }
  const taskId = taskField(task, "task_id", "id");
  const taskPrompt = taskField(task, "prompt", "instruction", "description", "goal") ?? JSON.stringify(task);
  const persona = taskField(task, "persona", "role");

  console.log(`=== Simulation (blobfish world): task ${taskId} ===`);
  console.log(`World file: ${worldPath}`);
  console.log(`Engine: ${MODEL} (context ${config.engine.contextWindowTokens.toLocaleString()} tokens)`);
  if (persona) console.log(`Persona: ${persona}`);

  const mcp = new McpClient(config.mcp.command, config.mcp.args, { cwd: ROOT, verbose: true });
  const init = await mcp.start();
  console.log(`MCP connected: ${init.serverInfo.name}`);
  const mcpTools = await mcp.listTools();
  const HARNESS = new Set(["verify_task", "reset_session"]);
  const llmTools = mcpTools.filter((t) => !HARNESS.has(t.name)).map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.inputSchema },
  }));
  console.log(`World tools exposed to agent: ${llmTools.length}\n`);

  const messages = [
    {
      role: "system",
      content:
        `You are an agent operating inside a fully synthetic Salesforce-CRM-style simulation world ` +
        `("Morgan Stanley (SIMULATED)" scenario — no real entities). ${init.instructions ?? ""} ` +
        (persona ? `You act in the persona: ${persona}. ` : "") +
        `Complete the task using the available tools. Be precise with ids and values. ` +
        `When the task is complete, reply with a final answer and no further tool calls.`,
    },
    { role: "user", content: typeof taskPrompt === "string" ? taskPrompt : JSON.stringify(taskPrompt) },
  ];

  // Reference-relative budget (blobfish calibrationBudgetCeiling-style): scale
  // the turn cap from the task's own reference walk length.
  const refWalk = Array.isArray(task.walk) ? task.walk.length : 0;
  const maxTurns = Math.max(config.engine.maxAgentTurns, refWalk * 3 + 6);
  const { usage, toolCallCount } = await runAgent(mcp, llmTools, messages, { maxTurns });
  printStats(usage, toolCallCount);

  console.log(`\n=== Verifying task ${taskId} via blobfish VCode ===`);
  const v = await mcp.callTool("verify_task", { task_id: taskId }, 60000);
  console.log(v.text);
  log({ type: "verify", taskId, result: v.text });
  mcp.close();
  const passed = v.data?.passed === true;
  console.log(passed ? "RESULT: PASSED" : "RESULT: NOT PASSED");
  if (jsonOutFlag) {
    writeFileSync(jsonOutFlag, JSON.stringify({
      mode: "blobfish",
      taskId,
      passed,
      reward: v.data?.reward ?? 0,
      failedConditions: v.data?.failed_conditions ?? [],
      toolCalls: toolCallCount,
      usage,
      costUsd: +(((usage.prompt / 1e6) * 2) + ((usage.completion / 1e6) * 6)).toFixed(4),
      log: LOG,
      finishedAt: new Date().toISOString(),
    }, null, 2));
  }
  return passed ? 0 : 2;
}

async function mainLocal() {
  const scenarioPath = argv.find((a) => a.endsWith(".json")) ?? join(ROOT, "sim", "scenarios", "quote-to-cash.json");
  const scenario = JSON.parse(readFileSync(scenarioPath, "utf8"));
  console.log(`=== Simulation (local mock): ${scenario.name} ===`);
  console.log(`Engine: ${MODEL} (context ${config.engine.contextWindowTokens.toLocaleString()} tokens)`);

  const mcp = new McpClient(config.mcpLocalFallback.command, config.mcpLocalFallback.args, { cwd: ROOT });
  const init = await mcp.start();
  console.log(`MCP connected: ${init.serverInfo.name} v${init.serverInfo.version}`);
  const mcpTools = await mcp.listTools();
  const llmTools = mcpTools.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.inputSchema },
  }));
  console.log(`Tools exposed to agent: ${llmTools.length}\n`);

  const messages = [
    {
      role: "system",
      content:
        `You are a revenue-operations agent inside "${config.world}", a fully simulated Salesforce-style CRM for a fictional ` +
        `investment bank (Morgan Stanley (SIMULATED) — synthetic data only). ${init.instructions ?? ""} ` +
        `You may act as internal approver roles (Deal Desk, Compliance Officer, Finance) when processing approvals — this is a sandbox. ` +
        `Use tools precisely with exact ids. When the goal is complete, reply with a final summary and no further tool calls.`,
    },
    { role: "user", content: scenario.goal },
  ];

  const { usage, toolCallCount } = await runAgent(mcp, llmTools, messages);
  printStats(usage, toolCallCount);

  const finalState = await mcp.callTool("get_flow_state", { opportunityId: scenario.opportunityId });
  console.log(`Final flow stage for ${scenario.opportunityId}: ${finalState.data?.flowStage}`);
  mcp.close();
  return finalState.data?.flowStage === "Order activated" ? 0 : 2;
}

(LOCAL ? mainLocal() : mainBlobfish())
  .then((code) => process.exit(code))
  .catch((e) => { console.error("Simulation failed:", e); process.exit(1); });
