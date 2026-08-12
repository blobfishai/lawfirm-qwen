#!/usr/bin/env node
/** Pure gate for bounded turn budgets and non-leaking system-level scopes. */
import { readFileSync } from "node:fs";
import { MEASUREMENT_PROTOCOL_ID, measurementProtocolId } from "../sim/lib/measurement-protocol.mjs";
import { scopeTools, turnBudget } from "../sim/lib/tool-scope.mjs";

const systems = {
  "practice-management": { tools: ["matters_list", "tasks_create"] },
  dms: { tools: ["documents_search", "documents_create"] },
  workspace: { tools: ["gmail_messages_send"] },
  esign: { tools: ["esign_envelopes_create"] },
  ediscovery: { tools: ["documents_query"] },
};
const tools = Object.values(systems).flatMap((spec) => spec.tools)
  .map((name) => ({ name, inputSchema: { type: "object", properties: {} } }));
const task = { task_id: "fixture", walk: ["documents_search", "documents_create"] };
const scoped = scopeTools(task, tools, systems, "systems");
if (!scoped.tools.some((tool) => tool.name === "documents_create")) throw new Error("required tool dropped");
if (scoped.metadata.distractorSystems.length !== 2) throw new Error("system distractors missing");
if (scoped.metadata.tools === 2) throw new Error("scope leaked exact reference walk");
if (scopeTools(task, tools, systems, "all").tools.length !== tools.length) throw new Error("all scope changed");
if (turnBudget(3, 50) !== 10 || turnBudget(5, 50) !== 12 || turnBudget(11, 50) !== 19 || turnBudget(50, 50) !== 50 || turnBudget(703, 50) !== 50) {
  throw new Error("reference-relative turn budget changed");
}
if (measurementProtocolId("systems") !== MEASUREMENT_PROTOCOL_ID || measurementProtocolId("all") !== null) {
  throw new Error("measurement protocol labeling changed");
}

const world = JSON.parse(readFileSync("world/blobfish/world-v19.json", "utf8"));
const actualSystems = JSON.parse(readFileSync("mcp/systems.json", "utf8")).systems;
const actualTools = Object.values(actualSystems).flatMap((spec) => spec.tools)
  .map((name) => ({ name, inputSchema: { type: "object" } }));
let maxScopedSystems = 0;
for (const actualTask of world.tasks) {
  const result = scopeTools(actualTask, actualTools, actualSystems, "systems");
  maxScopedSystems = Math.max(maxScopedSystems, result.metadata.systems.length);
}
console.log(`simulation-protocol gate: ${world.tasks.length} task scopes preserve required tools with distractors; `
  + `turn budgets bounded; max ${maxScopedSystems}/${Object.keys(actualSystems).length} systems exposed`);
