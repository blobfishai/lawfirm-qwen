#!/usr/bin/env node
/**
 * Per-system MCP server — exposes ONE firm system's tool subset over stdio.
 *
 *   node mcp/serve-system.mjs --system dms
 *   node mcp/serve-system.mjs --system docket-records
 *
 * Systems (one MCP server per product the firm runs) are defined in
 * mcp/systems.json; every server fronts the same local world runtime
 * (world/local/server.py) — one firm, many frontends. Tool names are
 * globally unique across systems, so a multi-server agent loop needs no
 * renaming and verifier traces stay compatible.
 *
 * Session sharing: pass BLOBFISH_SESSION_ID so several system servers join
 * the same episode (the runner creates the session over HTTP and hands the
 * id to every server). Without it, the server creates its own session
 * lazily — right for interactive exploration (e.g. via .mcp.json).
 *
 * Env: BLOBFISH_LOCAL_BASE (default from config.blobfish.localBase),
 *      BLOBFISH_SESSION_ID (optional shared session).
 */
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(readFileSync(join(ROOT, "config", "world.config.json"), "utf8"));
const systems = JSON.parse(readFileSync(join(ROOT, "mcp", "systems.json"), "utf8")).systems;

const argv = process.argv.slice(2);
const SYSTEM = argv.includes("--system") ? argv[argv.indexOf("--system") + 1] : null;
if (!SYSTEM || !systems[SYSTEM]) {
  process.stderr.write(`--system required. One of: ${Object.keys(systems).join(", ")}\n`);
  process.exit(1);
}
const SPEC = systems[SYSTEM];
const TOOL_SET = new Set(SPEC.tools);
const BASE = (process.env.BLOBFISH_LOCAL_BASE ?? config.blobfish.localBase ?? "http://127.0.0.1:8971").replace(/\/$/, "");

let SESSION = process.env.BLOBFISH_SESSION_ID || null;
let ACCESS_TOKEN = process.env.BLOBFISH_SESSION_TOKEN || null;
let TOOLS = [];
let rpcId = 5000;

async function http(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(SESSION ? { "Mcp-Session-Id": SESSION } : {}),
      ...(ACCESS_TOKEN ? { Authorization: `Bearer ${ACCESS_TOKEN}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  try {
    return { ok: res.ok, status: res.status,
      retryAfter: res.headers.get("retry-after"), json: JSON.parse(text), text };
  } catch {
    return { ok: res.ok, status: res.status,
      retryAfter: res.headers.get("retry-after"), json: null, text };
  }
}

async function ensureSession() {
  if (SESSION) return;
  const r = await http("POST", "/sessions", {});
  SESSION = r.json?.session_id;
  ACCESS_TOKEN = r.json?.access_token;
}

async function upstream(method, params) {
  const r = await http("POST", "/mcp", { jsonrpc: "2.0", id: ++rpcId, method, params });
  if (!r.ok) {
    const retry = r.retryAfter ? ` Retry-After=${r.retryAfter}.` : "";
    throw new Error(`upstream HTTP ${r.status}.${retry} ${r.text ?? JSON.stringify(r.json)}`);
  }
  if (r.json?.error) throw new Error(`${r.json.error.code}: ${r.json.error.message}`);
  return r.json?.result;
}

async function boot() {
  await ensureSession();
  const list = await upstream("tools/list", {});
  TOOLS = (list.tools ?? []).filter((t) => TOOL_SET.has(t.name));
  const missing = SPEC.tools.filter((n) => !TOOLS.some((t) => t.name === n));
  if (missing.length) process.stderr.write(`[${SYSTEM}] WARNING: world lacks tools: ${missing.join(", ")}\n`);
  process.stderr.write(`[${SYSTEM}] ${SPEC.product} — ${TOOLS.length} tools, session ${SESSION}\n`);
}

const send = (msg) => process.stdout.write(JSON.stringify(msg) + "\n");
const reply = (id, result) => send({ jsonrpc: "2.0", id, result });
const replyErr = (id, code, message) => send({ jsonrpc: "2.0", id, error: { code, message } });

async function handle(msg) {
  const { id, method, params = {} } = msg;
  const isNotification = id === undefined || id === null;
  try {
    switch (method) {
      case "initialize":
        return reply(id, {
          protocolVersion: params.protocolVersion ?? "2025-06-18",
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: `lawfirm-${SYSTEM}`, version: "1.0.0" },
          instructions:
            `${SPEC.product} — ${SPEC.description} Part of the Eve Litigation ` +
            `(SIMULATED) firm stack; no real entities. This server exposes only ` +
            `this system's tools; other firm systems run as separate MCP servers.`,
        });
      case "notifications/initialized":
      case "notifications/cancelled":
        return;
      case "ping":
        return reply(id, {});
      case "tools/list":
        return reply(id, { tools: TOOLS });
      case "tools/call": {
        const name = params.name;
        if (!TOOL_SET.has(name)) return replyErr(id, -32602, `'${name}' is not a ${SPEC.product} tool`);
        const result = await upstream("tools/call", { name, arguments: params.arguments ?? {} });
        return reply(id, result);
      }
      default:
        if (!isNotification) return replyErr(id, -32601, `Method not found: ${method}`);
    }
  } catch (e) {
    if (!isNotification) return replyErr(id, -32603, `[${SYSTEM}] ${e.message}`);
  }
}

boot()
  .then(() => {
    const rl = createInterface({ input: process.stdin, terminal: false });
    rl.on("line", (line) => {
      if (!line.trim()) return;
      let msg;
      try { msg = JSON.parse(line); } catch { return replyErr(null, -32700, "Parse error"); }
      handle(msg).catch((e) => process.stderr.write(`[${SYSTEM}] unhandled: ${e.stack}\n`));
    });
    rl.on("close", () => process.exit(0));
  })
  .catch((e) => {
    process.stderr.write(`[${SYSTEM}] boot failed: ${e.message} (is the world server up? npm run world:serve)\n`);
    process.exit(1);
  });
