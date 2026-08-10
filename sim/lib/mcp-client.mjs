/** Minimal MCP client over stdio (newline-delimited JSON-RPC 2.0). Zero dependencies. */
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

export class McpClient {
  constructor(command, args, opts = {}) {
    this.command = command;
    this.args = args;
    this.opts = opts;
    this.nextId = 1;
    this.pending = new Map();
  }

  async start() {
    this.child = spawn(this.command, this.args, {
      cwd: this.opts.cwd,
      env: this.opts.env ?? process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child.on("error", (e) => this.#failAll(e));
    this.child.stderr.on("data", (d) => {
      if (this.opts.verbose) process.stderr.write(`[server] ${d}`);
    });
    const rl = createInterface({ input: this.child.stdout, terminal: false });
    rl.on("line", (line) => {
      if (!line.trim()) return;
      let msg;
      try { msg = JSON.parse(line); } catch { return; }
      const waiter = this.pending.get(msg.id);
      if (!waiter) return;
      this.pending.delete(msg.id);
      if (msg.error) waiter.reject(new Error(`MCP ${msg.error.code}: ${msg.error.message}`));
      else waiter.resolve(msg.result);
    });
    this.init = await this.request("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "sim-runner", version: "1.0.0" },
    });
    this.notify("notifications/initialized", {});
    return this.init;
  }

  request(method, params = {}, timeoutMs = 15000) {
    const id = this.nextId++;
    const p = new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP request '${method}' timed out`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (v) => { clearTimeout(t); resolve(v); },
        reject: (e) => { clearTimeout(t); reject(e); },
      });
    });
    this.child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    return p;
  }

  notify(method, params = {}) {
    this.child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
  }

  async listTools() {
    return (await this.request("tools/list")).tools;
  }

  /** Calls a tool; returns { ok, text, data }. Business-rule failures come back as ok:false. */
  async callTool(name, args = {}, timeoutMs = 30000) {
    const res = await this.request("tools/call", { name, arguments: args }, timeoutMs);
    const text = (res.content ?? []).map((c) => c.text ?? "").join("\n");
    let data = null;
    try { data = JSON.parse(text); } catch { /* non-JSON tool output */ }
    return { ok: !res.isError, text, data };
  }

  #failAll(e) {
    for (const { reject } of this.pending.values()) reject(e);
    this.pending.clear();
  }

  close() {
    try { this.child.stdin.end(); } catch { /* already closed */ }
    setTimeout(() => { try { this.child.kill(); } catch { /* gone */ } }, 200).unref?.();
  }
}
