#!/usr/bin/env node
/**
 * Growth loop (playbook Stage 5): too-easy tasks are seeds — grow them into
 * longer-horizon variants until the model fails.
 *
 * Deterministic growth for the workflow-chain family: a base 3-step chain
 * (list → get → create) over an entity family grows to depth 6 / 8 / 10 by
 * interleaving audit-trail reviews, re-reads, and additional pinned writes
 * (evidence → review → remediation). Prompts follow the world's own compiled
 * workflow style — the chain is stated explicitly; the graded values are
 * stated exactly; execution depth and argument discipline are what's tested.
 *
 * Usage:
 *   node sim/grow-tasks.mjs [--engine deepseek-chat] [--families N=3] [--round r1]
 *
 * Picks the N entity families whose base workflow-chain tasks the engine
 * passed 3/3 (too easy), emits a growth pack under
 * world/expansion/growth-packs/, then prints the assemble/serve/measure
 * commands (or run them via npm run grow:admit).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const opt = (name, dflt) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : dflt);
const ENGINE = opt("--engine", "deepseek-chat");
const N_FAMILIES = Number(opt("--families", "3"));
const ROUND = opt("--round", "r1");

// entity family -> {prefix used by tools, amount field, record id}
const FAMILIES = {
  legal_matters: { amount: "fee_budget", id: "legal_matters_001", label: "legal matters" },
  legal_conflicts: { amount: "exposure_amount", id: "legal_conflicts_001", label: "legal conflicts" },
  legal_billing: { amount: "invoice_amount", id: "legal_billing_001", label: "legal billing" },
  litigation_cases: { amount: "claimed_amount", id: "litigation_cases_001", label: "litigation cases" },
  litigation_filings: { amount: "filing_cost", id: "litigation_filings_001", label: "litigation filings" },
  litigation_discovery: { amount: "production_cost", id: "litigation_discovery_001", label: "litigation discovery" },
  litigation_dockets: { amount: "docket_exposure", id: "litigation_dockets_001", label: "litigation dockets" },
  litigation_hearings: { amount: "hearing_cost", id: "litigation_hearings_001", label: "litigation hearings" },
  litigation_courts: { amount: "filing_fee_budget", id: "litigation_courts_001", label: "litigation courts" },
  litigation_deadlines: { amount: "deadline_exposure", id: "litigation_deadlines_001", label: "litigation deadlines" },
};

// -------- pick seed families the engine found too easy (3/3 on base chains)
const resPath = join(ROOT, "data", "leaderboard", "results", `${ENGINE}.json`);
const res = existsSync(resPath) ? JSON.parse(readFileSync(resPath, "utf8")) : null;
const easyFamilies = [];
if (res) {
  for (const t of res.tasks ?? []) {
    if (t.shape !== "workflow-chain" || t.passRate !== 1) continue;
    const worldRaw = null; // family from required tools via world doc below
    easyFamilies.push(t.taskId);
  }
}
const worldRaw = JSON.parse(readFileSync(join(ROOT, "world", "blobfish", "world-expanded.json"), "utf8"));
const world = worldRaw.world ?? worldRaw;
const taskById = Object.fromEntries(world.tasks.map((t) => [t.task_id, t]));
const famEasy = new Map(); // family -> exemplar seed task id
for (const tid of easyFamilies) {
  const walk = taskById[tid]?.walk ?? [];
  const m = /^(legal_[a-z]+|litigation_[a-z]+)_list$/.exec(walk[0] ?? "");
  if (m && FAMILIES[m[1]] && !famEasy.has(m[1])) famEasy.set(m[1], tid);
}
const chosen = [...famEasy.entries()].slice(0, N_FAMILIES);
if (!chosen.length) {
  console.error(`no too-easy workflow-chain families found for ${ENGINE} — nothing to grow`);
  process.exit(1);
}

// -------- depth ladders
function ladder(fam, depth, spec, seedTid) {
  const F = fam;
  const step = (tool, args) => ({ tool: `${F}_${tool}`, args });
  const amountVal = 100000 + depth * 12500 + [...F].reduce((a, c) => a + c.charCodeAt(0), 0) % 977;
  const outcomes = { 6: "approved", 8: "approved", 10: "rejected" };
  const remedLiteral = "close-out: chain verified end to end";
  const chains = {
    6: ["list", "get", "audit_list", "amount_history_create", "review_create", "get"],
    8: ["list", "get", "audit_list", "amount_history_create", "get", "evidence_create", "review_create", "audit_list"],
    10: ["list", "get", "audit_list", "amount_history_create", "get", "evidence_create", "audit_list", "review_create", "remediation_create", "get"],
  };
  const chain = chains[depth];
  const walk = chain.map((c) => `${F}_${c}`);
  const stepDesc = {
    list: `list ${spec.label}`, get: `get the record`, audit_list: `review its audit trail`,
    amount_history_create: `record a ${spec.amount.replace(/_/g, " ")} adjustment of exactly ${amountVal}`,
    evidence_create: `file an evidence record with evidence_type exactly "document"`,
    review_create: `file a review with outcome exactly "${outcomes[depth]}"`,
    remediation_create: `file a remediation with action_required exactly "${remedLiteral}"`,
  };
  const prompt =
    `Complete the "${spec.label} deep workflow (depth ${depth})" for Law Firm Company, executing every ` +
    `checkpoint in this exact order: ${chain.map((c) => stepDesc[c]).join(" -> ")}. ` +
    `Use the ${spec.label} record with id "${spec.id}" throughout. Perform each checkpoint with its own ` +
    `tool call — every listed step is required, in the listed order, including repeated reads.`;

  const creates = [];
  const refArgs = chain.map((c) => {
    switch (c) {
      case "list": return { limit: 50 };
      case "get": return { id: spec.id };
      case "audit_list": return { [`${F}_id`]: spec.id, limit: 20 };
      case "amount_history_create":
        creates.push({ tool: `${F}_amount_history_create`,
          args: { [`${F}_id`]: spec.id, [spec.amount]: amountVal, changed_by_role: "partner",
            change_reason: `Depth-${depth} chain adjustment recorded per workflow instruction.` },
          pinned: { [spec.amount]: amountVal } });
        return {};
      case "evidence_create":
        creates.push({ tool: `${F}_evidence_create`,
          args: { [`${F}_id`]: spec.id, evidence_type: "document", source_uri: "matter://growth/chain" },
          pinned: { evidence_type: "document" } });
        return {};
      case "review_create":
        creates.push({ tool: `${F}_review_create`,
          args: { [`${F}_id`]: spec.id, reviewer_role: "partner", outcome: outcomes[depth],
            rationale: "Chain review recorded per workflow instruction." },
          pinned: { outcome: outcomes[depth] } });
        return {};
      case "remediation_create":
        creates.push({ tool: `${F}_remediation_create`,
          args: { [`${F}_id`]: spec.id, owner_role: "associate", action_required: remedLiteral },
          pinned: { action_required: remedLiteral } });
        return {};
      default: return {};
    }
  });

  return {
    slug: `${F.replace(/_/g, "-")}-depth-${depth}`,
    prompt,
    goal: `Execute the ${depth}-step ${spec.label} chain in order with exact graded values`,
    reads: [],
    creates,
    walk_override: walk,
    reference_args_override: refArgs,
    query_first: false,
    difficulty: depth >= 10 ? "high" : "medium",
    growth: { seed_task: seedTid, family: F, depth, round: ROUND },
  };
}

const tasks = [];
for (const [fam, seedTid] of chosen) {
  for (const depth of [6, 8, 10]) tasks.push(ladder(fam, depth, FAMILIES[fam], seedTid));
}

const pack = {
  family: "depth-growth",
  anchor: "growth",
  documents: [],
  tasks,
};
const outDir = join(ROOT, "world", "expansion", "growth-packs");
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, `growth-${ROUND}.json`);
writeFileSync(outPath, JSON.stringify(pack, null, 1));
console.log(`growth pack: ${outPath}`);
console.log(`seeds (3/3 too-easy for ${ENGINE}): ${chosen.map(([f, t]) => `${f}←${t}`).join(", ")}`);
console.log(`grown tasks: ${tasks.length} (depths 6/8/10 per family)`);
console.log(`\nnext:\n  node world/expansion/assemble.mjs --packs-dir world/expansion/growth-packs --in world/blobfish/world-expanded.json --out world/blobfish/world-grown.json`);
console.log(`  python3 world/local/server.py --port 8974 --world world/blobfish/world-grown.json &`);
console.log(`  python3 world/local/oracle.py --base http://127.0.0.1:8974 --world world/blobfish/world-grown.json --tasks <grown ids>`);
