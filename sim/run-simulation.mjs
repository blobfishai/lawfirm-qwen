#!/usr/bin/env node
/**
 * Simulation runner: drives one task of the Eve Litigation law-firm world
 * (SIMULATED) with any OpenAI-compatible chat-completions model, through the
 * MCP bridge, and scores the rollout with the task's shipped VCode verifier.
 *
 * Usage:
 *   node sim/run-simulation.mjs [--task task_127] [--engine deepseek-chat]
 *        [--json-out out.json] [--episode-out episode.json]
 *        [--world-file world/blobfish/world-v16.json] [--max-turns N]
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
import { compactToolHistory, CONTEXT_POLICY } from "./lib/context-policy.mjs";
import { accumulateUsage, calculateCost, emptyUsage } from "./lib/cost-accounting.mjs";
import { MEASUREMENT_PROTOCOL, measurementProtocolId } from "./lib/measurement-protocol.mjs";
import { scopeTools, turnBudget } from "./lib/tool-scope.mjs";

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
const toolScopeFlag = opt("--tool-scope", "all");

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
  const body = JSON.stringify({
    model: ENGINE.model,
    messages,
    tools,
    tool_choice: "auto",
    max_tokens: ENGINE.maxCompletionTokens,
  });
  let lastError = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(`${ENGINE.baseUrl}/chat/completions`, {
        method: "POST", headers, body,
      });
      if (res.ok) return res.json();
      const detail = (await res.text()).slice(0, 500);
      lastError = new Error(`LLM API ${res.status}: ${detail}`);
      if (![408, 409, 429, 500, 502, 503, 504].includes(res.status) || attempt === 4) {
        throw lastError;
      }
      const retryAfter = Number(res.headers.get("retry-after"));
      const backoffMs = Number.isFinite(retryAfter)
        ? Math.min(30_000, Math.max(1_000, retryAfter * 1000))
        : Math.min(30_000, 2_000 * (2 ** attempt));
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    } catch (error) {
      lastError = error;
      if (attempt === 4 || String(error?.message ?? "").startsWith("LLM API 4")) throw error;
      await new Promise((resolve) => setTimeout(resolve, Math.min(30_000, 2_000 * (2 ** attempt))));
    }
  }
  throw lastError ?? new Error("LLM API failed without a response");
}

/** Agentic loop: model <-> MCP tools until a final (non-tool) answer or turn cap.
 *  The cap is reference-relative: a budget derived from the task's own walk
 *  length, so long-horizon tasks get proportionally long budgets. */
async function runAgent(mcp, llmTools, messages, opts = {}) {
  const maxTurns = opts.maxTurns ?? config.engine.maxAgentTurns;
  const usage = emptyUsage();
  const servedModels = new Set();
  const steps = []; // full episode record for failure-mode analysis
  let toolCallCount = 0;
  let finalText = null;
  const guardTokens = Math.floor(ENGINE.contextWindowTokens * (config.engine.contextGuardRatio ?? 0.9));

  for (let turn = 1; turn <= maxTurns; turn++) {
    compactToolHistory(
      messages,
      CONTEXT_POLICY.keepRecentToolResults,
      CONTEXT_POLICY.oldToolResultChars,
    );
    let resp;
    try {
      resp = await chat(messages, llmTools);
    } catch (e) {
      // one retry on transport-level errors
      await new Promise((r) => setTimeout(r, 3000));
      resp = await chat(messages, llmTools);
    }
    const u = resp.usage ?? {};
    accumulateUsage(usage, u);
    if (resp.model) servedModels.add(resp.model);
    log({ type: "completion", turn, model: resp.model, usage: u });

    if ((u.prompt_tokens ?? 0) > guardTokens) {
      compactToolHistory(
        messages,
        CONTEXT_POLICY.pressureKeepRecentToolResults,
        CONTEXT_POLICY.pressureOldToolResultChars,
      );
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
  return {
    usage,
    servedModels: [...servedModels],
    toolCallCount,
    finalText,
    steps,
    turnsUsed: steps.length ? steps[steps.length - 1].turn : maxTurns,
  };
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

  // MCP topology: "multi" = one MCP server per firm system (mcp/systems.json),
  // all sharing one episode session over the world runtime; "bridge" (default)
  // = the single-surface bridge every measured run to date used. The default
  // stays "bridge" so measurement protocol never changes implicitly — switch
  // per run with --mcp multi.
  const mcpMode = opt("--mcp", "bridge");
  const localBase = (process.env.BLOBFISH_LOCAL_BASE ?? config.blobfish.localBase).replace(/\/$/, "");
  let mcp;               // { instructions, tools, callTool(name,args,timeout), verify(taskId), close() }

  if (mcpMode === "multi") {
    const systems = JSON.parse(readFileSync(join(ROOT, "mcp", "systems.json"), "utf8")).systems;
    const sess = await fetch(`${localBase}/sessions`, { method: "POST", body: JSON.stringify({ task_id: taskId }), headers: { "Content-Type": "application/json" } }).then((r) => r.json());
    const sessionId = sess.session_id;
    const accessToken = sess.access_token;
    const TRACE = [];
    const clients = {};
    const route = {};
    const tools = [];
    const instructions = [];
    for (const [sysName, spec] of Object.entries(systems)) {
      const c = new McpClient("node", ["mcp/serve-system.mjs", "--system", sysName], {
        cwd: ROOT,
        env: { ...process.env, BLOBFISH_SESSION_ID: sessionId,
          BLOBFISH_SESSION_TOKEN: accessToken, BLOBFISH_LOCAL_BASE: localBase },
      });
      const init = await c.start();
      instructions.push(`${spec.product}: ${spec.description}`);
      clients[sysName] = c;
      for (const t of await c.listTools()) {
        route[t.name] = c;
        tools.push(t);
      }
    }
    mcp = {
      instructions:
        `The firm runs ${Object.keys(systems).length} separate systems, each exposed as its own MCP server: ` +
        instructions.join(" · "),
      tools,
      async callTool(name, args, timeoutMs) {
        const c = route[name];
        if (!c) return { ok: false, text: `ERROR: unknown tool '${name}'`, data: null };
        const r = await c.callTool(name, args, timeoutMs);
        TRACE.push({ tool: name, requested_tool: name, arguments: args, observation: String(r.text).slice(0, 4000), ok: r.ok });
        return r;
      },
      async verify(tid) {
        const res = await fetch(`${localBase}/verify/${encodeURIComponent(tid)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Mcp-Session-Id": sessionId,
            Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ trace: TRACE }),
        });
        const data = await res.json().catch(() => null);
        return { ok: res.ok, text: JSON.stringify(data, null, 2), data };
      },
      async close() {
        for (const c of Object.values(clients)) c.close();
        await fetch(`${localBase}/sessions/${sessionId}`, {
          method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` },
        }).catch(() => {});
      },
    };
  } else {
    const client = new McpClient(config.mcp.command, config.mcp.args, {
      cwd: ROOT,
      env: {
        ...process.env,
        BLOBFISH_LOCAL: process.env.BLOBFISH_LOCAL ?? "1",
        BLOBFISH_LOCAL_BASE: localBase,
        BLOBFISH_TASK_ID: taskId,
      },
    });
    const init = await client.start();
    const HARNESS = new Set(["verify_task", "reset_session"]);
    mcp = {
      instructions: init.instructions ?? "",
      tools: (await client.listTools()).filter((t) => !HARNESS.has(t.name)),
      callTool: (n, a, t) => client.callTool(n, a, t),
      verify: (tid) => client.callTool("verify_task", { task_id: tid }, 60000),
      close: () => client.close(),
    };
  }

  const systems = JSON.parse(readFileSync(join(ROOT, "mcp", "systems.json"), "utf8")).systems;
  const scoped = scopeTools(task, mcp.tools, systems, toolScopeFlag);
  const llmTools = scoped.tools.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.inputSchema },
  }));

  const messages = [
    {
      role: "system",
      content:
        `You are an agent operating inside a fully synthetic litigation/corporate law-firm ` +
        `simulation world ("Eve Litigation" — SIMULATED; no real entities, clients, or matters). ` +
        `${mcp.instructions ?? ""} ` +
        `Complete the task using the available tools. Be precise with record ids and values. ` +
        `Read input documents in full before drafting deliverables from them. ` +
        `When the task is complete, reply with a final answer and no further tool calls.`,
    },
    { role: "user", content: typeof taskPrompt === "string" ? taskPrompt : JSON.stringify(taskPrompt) },
  ];

  const refWalk = Array.isArray(task.walk) ? task.walk.length : 0;
  // maxAgentTurns is a hard ceiling, not a floor. The former Math.max made a
  // three-call task run for at least 50 turns and a 703-call task eligible for
  // 2,115 turns, turning harness indecision into unbounded API spend.
  const maxTurns = maxTurnsFlag ? Number(maxTurnsFlag) : turnBudget(refWalk, config.engine.maxAgentTurns);
  const startedAtMs = Date.now();
  const { usage, servedModels, toolCallCount, finalText, steps, turnsUsed } = await runAgent(
    mcp, llmTools, messages, { maxTurns },
  );

  const v = await mcp.verify(taskId);
  log({ type: "verify", taskId, result: v.text });
  await mcp.close();

  const passed = v.data?.passed === true;
  const cost = calculateCost(usage, ENGINE.pricing);
  const costUsd = +cost.totalUsd.toFixed(5);
  console.log(`tool calls: ${toolCallCount} | tokens p${usage.prompt}/c${usage.completion} | $${costUsd}`);
  console.log(passed ? "RESULT: PASSED" : `RESULT: NOT PASSED (${(v.data?.failed_conditions ?? []).join(", ")})`);

  const record = {
    taskId,
    engine: ENGINE.id,
    model: ENGINE.model,
    servedModels,
    mcpMode,
    measurementProtocol: measurementProtocolId(toolScopeFlag, maxTurnsFlag !== null),
    measurementProtocolConfig: MEASUREMENT_PROTOCOL,
    toolScope: scoped.metadata,
    contextPolicy: CONTEXT_POLICY,
    worldVersion: world.version ?? null,
    worldFile: worldFileFlag ?? config.blobfish.world,
    worldId: world.world_id ?? null,
    localBase,
    passed,
    reward: v.data?.reward ?? 0,
    failedConditions: v.data?.failed_conditions ?? [],
    advisoryConditions: v.data?.advisory_conditions ?? [],
    assertions: v.data?.assertions ?? [],
    // Full verdict fields for leaderboard-v2 (P/R, lane split, grounding) — the
    // verifier emits precision/recall/f_beta on retrieval tasks and file/state
    // lane sub-verdicts on dual-lane tasks; keep them verbatim rather than
    // re-deriving downstream.
    verdict: {
      precision: v.data?.precision ?? null,
      recall: v.data?.recall ?? null,
      f_beta: v.data?.f_beta ?? null,
      over_included: v.data?.over_included ?? null,
      paging_complete: v.data?.paging_complete ?? null,
      paging_discipline: v.data?.paging_discipline ?? null,
      lanes: v.data?.lanes ?? null,
      grounding_fraction: v.data?.raw_grounding_fraction ?? v.data?.grounding_fraction ?? null,
    },
    capabilityType: task.capability_type ?? null,
    contamination: task.contamination ?? task.metadata?.contamination ?? null,
    method: task.method ?? null,
    toolCalls: toolCallCount,
    finalText,
    turnsUsed,
    maxTurns,
    usage,
    costUsd,
    cost,
    log: LOG,
    durationMs: Date.now() - startedAtMs,
    finishedAt: new Date().toISOString(),
  };
  if (jsonOutFlag) writeFileSync(jsonOutFlag, JSON.stringify(record, null, 2));
  if (episodeOutFlag) writeFileSync(episodeOutFlag, JSON.stringify({ ...record, steps }, null, 2));
  return passed ? 0 : 2;
}

main()
  .then((code) => process.exit(code))
  .catch((e) => { console.error("Simulation failed:", e); process.exit(1); });
