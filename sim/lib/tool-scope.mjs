/** Deterministic system-level tool scoping for measured episodes. */
import { createHash } from "node:crypto";

const CORE_SYSTEMS = ["practice-management", "dms", "workspace"];
const DISTRACTOR_SYSTEMS = [
  "docket-records", "courtfile-efiling", "deadline-rules", "ediscovery", "ebilling",
];

function distractor(taskId, candidates, salt) {
  if (!candidates.length) return null;
  const value = createHash("sha256").update(`${salt}:${taskId}`).digest().readUInt32BE(0);
  return candidates[value % candidates.length];
}

/**
 * Expose every system the reference workflow touches, one deterministic core
 * distractor, and one deterministic specialist distractor. Scoping at system
 * granularity avoids revealing the exact tool walk while keeping every vendor
 * schema unchanged.
 */
export function scopeTools(task, tools, systems, mode = "all") {
  if (!new Set(["all", "systems"]).has(mode)) throw new Error(`unknown tool scope '${mode}'`);
  const allBytes = tools.reduce((sum, tool) => sum + Buffer.byteLength(JSON.stringify(tool)), 0);
  if (mode === "all") {
    return { tools, metadata: { mode, systems: Object.keys(systems).sort(), tools: tools.length, schemaBytes: allBytes } };
  }

  const toolToSystem = new Map();
  for (const [system, spec] of Object.entries(systems)) {
    for (const name of spec.tools ?? []) {
      if (toolToSystem.has(name)) throw new Error(`tool '${name}' appears in multiple systems`);
      toolToSystem.set(name, system);
    }
  }
  const available = new Set(tools.map((tool) => tool.name));
  const walk = [...new Set(task.walk ?? [])];
  const unmapped = walk.filter((name) => available.has(name) && !toolToSystem.has(name));
  if (unmapped.length) throw new Error(`task ${task.task_id} uses unmapped tools: ${unmapped.join(", ")}`);

  const selected = new Set();
  for (const name of walk) {
    const system = toolToSystem.get(name);
    if (system) selected.add(system);
  }
  const coreExtra = distractor(
    task.task_id,
    CORE_SYSTEMS.filter((name) => systems[name] && !selected.has(name)),
    "core",
  );
  if (coreExtra) selected.add(coreExtra);
  const specialistExtra = distractor(
    task.task_id,
    DISTRACTOR_SYSTEMS.filter((name) => systems[name] && !selected.has(name)),
    "specialist",
  );
  if (specialistExtra) selected.add(specialistExtra);

  const selectedNames = new Set(
    [...selected].flatMap((system) => systems[system]?.tools ?? []),
  );
  const scoped = tools.filter((tool) => selectedNames.has(tool.name));
  const missingWalk = walk.filter((name) => available.has(name) && !scoped.some((tool) => tool.name === name));
  if (missingWalk.length) throw new Error(`tool scope dropped required walk tools: ${missingWalk.join(", ")}`);
  return {
    tools: scoped,
    metadata: {
      mode,
      systems: [...selected].sort(),
      distractorSystems: [coreExtra, specialistExtra].filter(Boolean).sort(),
      tools: scoped.length,
      schemaBytes: scoped.reduce((sum, tool) => sum + Buffer.byteLength(JSON.stringify(tool)), 0),
      allTools: tools.length,
      allSchemaBytes: allBytes,
    },
  };
}

export function turnBudget(referenceCalls, maximum = 50) {
  if (!Number.isFinite(referenceCalls) || referenceCalls < 0) throw new Error("invalid reference call count");
  if (!Number.isInteger(maximum) || maximum < 1) throw new Error("invalid maximum turn count");
  return Math.min(maximum, Math.max(10, Math.ceil(referenceCalls * 1.25) + 5));
}
