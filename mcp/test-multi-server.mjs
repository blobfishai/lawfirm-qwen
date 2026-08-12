#!/usr/bin/env node
/**
 * Multi-server integration test — proves the per-system MCP topology works
 * end to end: spawns every system server against the running world runtime
 * with one shared session, checks the aggregated tool surface equals the
 * product runtime's tools, drives a real task's reference walk through the
 * servers that own each tool, and requires the
 * shipped verifier to PASS on the merged trace.
 *
 * Prereq: npm run world:serve   (world/local/server.py on :8971)
 * Run:    node mcp/test-multi-server.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { McpClient } from "../sim/lib/mcp-client.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(readFileSync(join(ROOT, "config", "world.config.json"), "utf8"));
const systems = JSON.parse(readFileSync(join(ROOT, "mcp", "systems.json"), "utf8")).systems;
const BASE = (process.env.BLOBFISH_LOCAL_BASE ?? config.blobfish.localBase).replace(/\/$/, "");

const worldRaw = JSON.parse(readFileSync(join(ROOT, config.blobfish.world), "utf8"));
const world = worldRaw.world ?? worldRaw;

const fail = (msg) => { console.error(`FAIL: ${msg}`); process.exit(1); };

const sess = await fetch(`${BASE}/sessions`, { method: "POST", body: "{}", headers: { "Content-Type": "application/json" } }).then((r) => r.json());
const sessionId = sess.session_id ?? fail("could not create session — is the world server up?");
console.log(`session ${sessionId} @ ${BASE}`);
const upstreamList = await fetch(`${BASE}/mcp`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "Mcp-Session-Id": sessionId },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
}).then((r) => r.json());
const upstreamNames = new Set((upstreamList.result?.tools ?? []).map((tool) => tool.name));

const clients = {};
const route = {};
let toolCount = 0;
for (const sysName of Object.keys(systems)) {
  const c = new McpClient("node", ["mcp/serve-system.mjs", "--system", sysName], {
    cwd: ROOT,
    env: { ...process.env, BLOBFISH_SESSION_ID: sessionId, BLOBFISH_LOCAL_BASE: BASE },
  });
  await c.start();
  const tools = await c.listTools();
  clients[sysName] = c;
  for (const t of tools) {
    if (route[t.name]) fail(`tool ${t.name} served by both ${route[t.name].sys} and ${sysName}`);
    route[t.name] = { client: c, sys: sysName };
  }
  toolCount += tools.length;
  console.log(`  ${sysName}: ${tools.length} tools`);
}
if (toolCount !== upstreamNames.size) fail(`aggregated ${toolCount} tools; product runtime has ${upstreamNames.size}`);
const missing = [...upstreamNames].filter((name) => !route[name]);
if (missing.length) fail(`unrouted product tools: ${missing.join(", ")}`);
console.log(`aggregated surface: ${toolCount} tools across ${Object.keys(systems).length} servers ✓`);

// cross-system sanity: a DMS read and a docketing list through different servers
const TRACE = [];
async function call(name, args) {
  const r = route[name] ?? fail(`no route for ${name}`);
  const res = await r.client.callTool(name, args, 60000);
  TRACE.push({ tool: name, requested_tool: name, arguments: args, observation: String(res.text).slice(0, 4000), ok: res.ok });
  console.log(`  [${r.sys}] ${name}(${JSON.stringify(args).slice(0, 60)}) → ${res.ok ? "ok" : "ERR"}`);
  return res;
}
await call("documents_search", { anywhere: "memo", limit: 2 });
await call("dockets_list", { limit: 2 });

// full reference walk of one migrated task through the servers, then verify
const task = world.tasks.find((t) => t.task_id === "task_v3_001");
const vwalk = task.walk;
const args = task.reference_args;
console.log(`reference walk: ${task.task_id}`);
for (let i = 0; i < vwalk.length; i++) {
  const r = await call(vwalk[i], args[i]);
  if (!r.ok) fail(`walk step ${vwalk[i]} errored`);
}
const verdict = await fetch(`${BASE}/verify/${task.task_id}`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "Mcp-Session-Id": sessionId },
  body: JSON.stringify({ trace: TRACE }),
}).then((r) => r.json());
// the two cross-system sanity reads are extra successful reads before the walk —
// allowed by the verifier (noise between checkpoints is legal, order is what counts)
if (verdict.passed !== true) fail(`verifier failed: ${JSON.stringify(verdict.failed_conditions)}`);
console.log(`verifier: PASSED (reward ${verdict.reward}) ✓`);

for (const c of Object.values(clients)) c.close();
await fetch(`${BASE}/sessions/${sessionId}`, { method: "DELETE" }).catch(() => {});
console.log("multi-server topology: ALL CHECKS PASSED");
process.exit(0);
