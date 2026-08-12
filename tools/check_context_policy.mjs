#!/usr/bin/env node
import { compactToolHistory, CONTEXT_POLICY } from "../sim/lib/context-policy.mjs";

const messages = [{ role: "system", content: "s" }, { role: "user", content: "u" }];
for (let index = 0; index < 20; index++) {
  messages.push({ role: "assistant", content: "", tool_calls: [{ id: String(index) }] });
  messages.push({ role: "tool", tool_call_id: String(index), content: `${index}:` + "x".repeat(2000) });
}
const changed = compactToolHistory(
  messages, CONTEXT_POLICY.keepRecentToolResults, CONTEXT_POLICY.oldToolResultChars,
);
const tools = messages.filter((message) => message.role === "tool");
if (changed !== 8) throw new Error(`expected 8 compacted results, got ${changed}`);
if (!tools.slice(0, 8).every((message) => message.content.length < 1100)) throw new Error("old results not compacted");
if (!tools.slice(-12).every((message) => message.content.length > 2000)) throw new Error("recent results changed");
if (!messages.filter((message) => message.role === "assistant").every((message) => message.tool_calls)) {
  throw new Error("assistant/tool protocol linkage changed");
}
console.log("context-policy gate: old observations compact deterministically; 12 recent results and protocol links preserved");
