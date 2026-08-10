#!/usr/bin/env node
/**
 * Simulation runner: drives one task of the Eve Litigation law-firm world
 * (SIMULATED) with any OpenAI-compatible chat-completions model, through the
 * MCP bridge, and scores the rollout with the task's shipped VCode verifier.
 *
 * Usage:
 *   node sim/run-simulation.mjs [--task task_127] [--engine deepseek-chat]
 *        [--json-out out.json] [--episode-out episode.json]
 *        [--world-file world/blobfish/world.json] [--max-turns N]
 *
 * Engines resolve from config/world.config.json:
 *   --engine <id>   a config.models entry (baseUrl/baseUrlEnv + apiKeyEnv)
 *   (default)       config.engine (QWEN_BASE_URL / QWEN_API_KEY)
 *
 * The world server must be running (npm run world:serve); the bridge runs in
 * BLOBFISH_LOCAL=1 mode against it.
 */
import { readFileSync, existsSync, mkdirSync, appendFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { McpClient } from "./lib/mcp-client.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(readFileSync(join(ROOT, "config", "world.config.json"), "utf8"));

const argv = process.argv.slice(2);
const opt = (name, dflt) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : dflt);
const taskFlag = opt("--task", null);
const engineFlag = opt("--engine", null);
const jsonOutFlag = opt("--json-out", null);
const episodeOutFlag = opt("--episode-out", null);
const worldFileFlag = opt("--world-file", null);
const maxTurnsFlag = opt("--max-turns", null);

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

function resolveEngine() {
  const spec = engineFlag ? config.models?.[engineFlag] : config.engine;
  if (!spec) {
    console.error(`Unknown engine '${engineFlag}'. Registry: ${Object.keys(config.models ?? {}).join(", ")}`);
    process.exit(1);
  }
  const baseUrl = spec.baseUrl ?? env[spec.baseUrlEnv];
  const apiKey = env[spec.apiKeyEnv];
  if (!baseUrl || !apiKey) {
    console.error(`Engine '${engineFlag ?? "default"}' needs ${spec.baseUrlEnv ?? "baseUrl"} and ${spec.apiKeyEnv} set (repo .env or environment).`);
    process.exit(1);
  }
  return {
    id: engineFlag ?? spec.model,
    label: spec.label ?? spec.model,
    baseUrl: baseUrl.replace(/\/$/, ""),
    apiKey,
    model: spec.model,
    provider: spec.provider ?? "openai-compatible",
    contextWindowTokens: spec.contextWindowTokens ?? 131072,
    maxCompletionTokens: spec.maxCompletionTokens ?? 4096,
    pricing: spec.pricing ?? { inputPerM: 0, outputPerM: 0 },
  };
}
const ENGINE = resolveEngine();

const LOG_DIR = join(ROOT, "sim", "logs");
mkdirSync(LOG_DIR, { recursive: true });
const LOG = join(LOG_DIR, `run-${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`);
const log = (obj) => appendFileSync(LOG, JSON.stringify(obj) + "\n");

const TRUNCATE = 8000;
const clip = (s) => (s.length > TRUNCATE ? s.slice(0, TRUNCATE) + `\n…[truncated ${s.length - TRUNCATE} chars]` : s);

async function chat(messages, tools) {
  const headers = {
    Authorization: `Bearer ${ENGINE.apiKey}`,
    "Content-Type": "application/json",
  };
  if (ENGINE.provider === "anthropic-openai-compat") headers["x-api-key"] = ENGINE.apiKey;
  const res = await fetch(`${ENGINE.baseUrl}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: ENGINE.model,
      messages,
      tools,
      tool_choice: "auto",
      max_tokens: ENGINE.maxCompletionTokens,
    }),
  });
  if (!res.ok) throw new Error(`LLM API ${res.status}: ${(await res.text()).slice(0, 500)}`);
  return res.json();
}

/** Agentic loop: model <-> MCP tools until a final (non-tool) answer or turn cap.
 *  The cap is reference-relative: a budget derived from the task's own walk
 *  length, so long-horizon tasks get proportionally long budgets. */
async function runAgent(mcp, llmTools, messages, opts = {}) {
  const maxTurns = opts.maxTurns ?? config.engine.maxAgentTurns;
  const usage = { prompt: 0, completion: 0, total: 0 };
  const steps = []; // full episode record for failure-mode analysis
  let toolCallCount = 0;
  let finalText = null;
  const guardTokens = Math.floor(ENGINE.contextWindowTokens * (config.engine.contextGuardRatio ?? 0.9));

  for (let turn = 1; turn <= maxTurns; turn++) {
    let resp;
    try {
      resp = await chat(messages, llmTools);
    } catch (e) {
      // one retry on transport-level errors
      await new Promise((r) => setTimeout(r, 3000));
      resp = await chat(messages, llmTools);
    }
    const u = resp.usage ?? {};
    usage.prompt += u.prompt_tokens ?? 0;
    usage.completion += u.completion_tokens ?? 0;
    usage.total += u.total_tokens ?? 0;
    log({ type: "completion", turn, model: resp.model, usage: u });

    if ((u.prompt_tokens ?? 0) > guardTokens) {
      const oldTool = messages.find((m) => m.role === "tool" && m.content !== "[trimmed]");
      if (oldTool) oldTool.content = "[trimmed]";
    }

    const msg = resp.choices?.[0]?.message ?? {};
    const finishReason = resp.choices?.[0]?.finish_reason ?? null;
    if (finishReason === "length") log({ type: "truncation", turn, note: "completion hit max_tokens" });
    const thought = msg.reasoning_content ? String(msg.reasoning_content).slice(0, 2000) : null;
    if (thought) log({ type: "thinking", turn, content: thought });
    messages.push({ role: "assistant", content: msg.content ?? "", tool_calls: msg.tool_calls });

    if (msg.tool_calls?.length) {
      for (const tc of msg.tool_calls) {
        let args = {};
        let argParseError = false;
        try { args = JSON.parse(tc.function.arguments || "{}"); } catch { argParseError = true; }
        let resultText;
        let ok = false;
        try {
          const r = await mcp.callTool(tc.function.name, args, 180000);
          resultText = r.text;
          ok = r.ok;
          toolCallCount++;
        } catch (e) {
          resultText = `ERROR: ${e.message}`;
        }
        steps.push({
          turn,
          tool: tc.function.name,
          args,
          argBytes: (tc.function.arguments || "").length,
          argParseError,
          ok,
          observation: String(resultText).slice(0, 600),
          thought,
        });
        log({ type: "tool", turn, name: tc.function.name, args, ok, result: String(resultText).slice(0, 2000) });
        messages.push({ role: "tool", tool_call_id: tc.id, content: clip(String(resultText)) });
      }
      continue;
    }

    finalText = msg.content;
    steps.push({ turn, tool: "_final_answer", ok: true, thought, observation: String(finalText ?? "").slice(0, 600) });
    log({ type: "final", turn, content: finalText });
    break;
  }
  return { usage, toolCallCount, finalText, steps, turnsUsed: steps.length ? steps[steps.length - 1].turn : maxTurns };
}

const taskField = (t, ...names) => names.map((n) => t[n]).find((v) => v !== undefined && v !== null);

async function main() {
  const worldPath = worldFileFlag ?? join(ROOT, config.blobfish.world);
  if (!existsSync(worldPath)) {
    console.error(`World file not found: ${worldPath}`);
    process.exit(1);
  }
  const raw = JSON.parse(readFileSync(worldPath, "utf8"));
  const world = raw.world ?? raw;
  const tasks = world.tasks ?? [];
  const task = taskFlag ? tasks.find((t) => taskField(t, "task_id", "id") === taskFlag) : tasks[0];
  if (!task) { console.error(`Task '${taskFlag}' not found.`); process.exit(1); }
  const taskId = taskField(task, "task_id", "id");
  const taskPrompt = taskField(task, "prompt", "instruction", "goal") ?? JSON.stringify(task);

  console.log(`=== Episode: ${taskId} | engine ${ENGINE.label} (${ENGINE.model}) ===`);

  const mcp = new McpClient(config.mcp.command, config.mcp.args, {
    cwd: ROOT,
    env: { ...process.env, BLOBFISH_LOCAL: process.env.BLOBFISH_LOCAL ?? "1" },
  });
  const init = await mcp.start();
  const mcpTools = await mcp.listTools();
  const HARNESS = new Set(["verify_task", "reset_session"]);
  const llmTools = mcpTools.filter((t) => !HARNESS.has(t.name)).map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.inputSchema },
  }));

  const messages = [
    {
      role: "system",
      content:
        `You are an agent operating inside a fully synthetic litigation/corporate law-firm ` +
        `simulation world ("Eve Litigation" — SIMULATED; no real entities, clients, or matters). ` +
        `${init.instructions ?? ""} ` +
        `Complete the task using the available tools. Be precise with record ids and values. ` +
        `Read input documents in full before drafting deliverables from them. ` +
        `When the task is complete, reply with a final answer and no further tool calls.`,
    },
    { role: "user", content: typeof taskPrompt === "string" ? taskPrompt : JSON.stringify(taskPrompt) },
  ];

  const refWalk = Array.isArray(task.walk) ? task.walk.length : 0;
  const maxTurns = maxTurnsFlag ? Number(maxTurnsFlag) : Math.max(config.engine.maxAgentTurns, refWalk * 3 + 6);
  const { usage, toolCallCount, steps, turnsUsed } = await runAgent(mcp, llmTools, messages, { maxTurns });

  const v = await mcp.callTool("verify_task", { task_id: taskId }, 60000);
  log({ type: "verify", taskId, result: v.text });
  mcp.close();

  const passed = v.data?.passed === true;
  const costUsd = +((usage.prompt / 1e6) * ENGINE.pricing.inputPerM + (usage.completion / 1e6) * ENGINE.pricing.outputPerM).toFixed(5);
  console.log(`tool calls: ${toolCallCount} | tokens p${usage.prompt}/c${usage.completion} | $${costUsd}`);
  console.log(passed ? "RESULT: PASSED" : `RESULT: NOT PASSED (${(v.data?.failed_conditions ?? []).join(", ")})`);

  const record = {
    taskId,
    engine: ENGINE.id,
    model: ENGINE.model,
    passed,
    reward: v.data?.reward ?? 0,
    failedConditions: v.data?.failed_conditions ?? [],
    advisoryConditions: v.data?.advisory_conditions ?? [],
    assertions: v.data?.assertions ?? [],
    toolCalls: toolCallCount,
    turnsUsed,
    maxTurns,
    usage,
    costUsd,
    log: LOG,
    finishedAt: new Date().toISOString(),
  };
  if (jsonOutFlag) writeFileSync(jsonOutFlag, JSON.stringify(record, null, 2));
  if (episodeOutFlag) writeFileSync(episodeOutFlag, JSON.stringify({ ...record, steps }, null, 2));
  return passed ? 0 : 2;
}

main()
  .then((code) => process.exit(code))
  .catch((e) => { console.error("Simulation failed:", e); process.exit(1); });
