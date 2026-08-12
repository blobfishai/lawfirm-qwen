#!/usr/bin/env node
/**
 * v3 API documentation — per product: the tool surface as an agent sees it,
 * with the REAL external parameter names, the internal mapping, the real
 * response envelope, the SQL backing, and the persona scenario.
 *
 * Output: docs/api/V3-README.md + docs/api/v3-<product>.md
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const SRC = join(HERE, "contracts");
const OUT = join(ROOT, "docs", "api");

const ENVELOPE = {
  clio: { list: '{"data": [...], "meta": {"paging": {}, "records": N}}', get: '{"data": {...}}', write: '{"data": {...}}' },
  courtlistener: { list: '{"count": N|count-URL, "next": null, "previous": null, "results": [...]}', get: '{...resource fields...}', write: '{...}' },
  imanage: { list: '{"data": {"results": [...], "total": N}}', get: '{"data": {...}}', write: '{"data": {...}}' },
  relativity: { list: '{"Objects": [{"ArtifactID": id, ...}], "TotalCount": N, "CurrentStartIndex": 0}', get: '{"ArtifactID": id, ...}', write: '{...}' },
  ledes: { list: '{"count": N, "lines"|"invoices": [{"LINE_ITEM_TASK_CODE": ..., "LINE_ITEM_TOTAL": ...}]}', get: "LEDES 1998B field-named object", write: "LEDES 1998B field-named object" },
  google: { list: 'API-native: {"values": [[...]]} · {"kind": "drive#fileList", "files": [...]} · {"messages": [...], "resultSizeEstimate": N} · {"kind": "calendar#events", "items": [...]}', get: 'resource objects: drive#file · Gmail message (payload.headers) · calendar#event', write: 'e.g. {"spreadsheetId", "updatedRange", "updatedCells"}' },
  cmecf: { list: '{"count", "results", "has_more"}', get: '{"case": {...}}', write: '{"filing_id", "docket_entry_id", "nef_notice_id", "status": "filed"}' },
  calendar_rules: { list: '{"deadlines": [{"date", "rule_citation", "source_url"}]}', get: '{"deadlines": [...] }', write: 'read-only computation surface' },
  docusign: { list: '{"signers": [{"recipientId", "routingOrder", "status"}]}', get: '{"envelopeId", "status", "statusDateTime"}', write: '{"envelopeId", "status"}' },
};
const esc = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");

const index = [
  "# v3 mock services — vendor-shaped, conformance measured",
  "",
  "Each product tool maps to a cited vendor operation and executes against",
  "session-private SQLite. Mapping is not exactness: input, response, pagination,",
  "encoding, and error conformance are tracked separately in `docs/CONFORMANCE.md`.",
  "Serve the canonical product-only world with:",
  "",
  "```bash",
  "python3 world/local/server.py --port 8979 \\",
  "  --world world/blobfish/world-v16.json --v2-contracts mcp/v3/contracts",
  "```",
  "",
  "| Product | Dialect | Tools | Real API mirrored |",
  "|---|---|---|---|",
];

let total = 0;
let internalTotal = 0;
for (const f of readdirSync(SRC).filter((x) => x.endsWith(".json"))) {
  const c = JSON.parse(readFileSync(join(SRC, f), "utf8"));
  const visibleTools = c.tools.filter((tool) => tool.agent_visible !== false);
  const internalTools = c.tools.filter((tool) => tool.agent_visible === false);
  total += visibleTools.length;
  internalTotal += internalTools.length;
  index.push(`| [${c.system}](./v3-${f.replace(".json", ".md")}) | \`${c.dialect}\` | ${visibleTools.length} | ${esc(c.provenance.split(" (")[0])} |`);

  const md = [
    `# ${c.product}`,
    "",
    `**Dialect:** \`${c.dialect}\` · **Provenance:** ${c.provenance}`,
    "",
    "**Response envelopes** (what every tool of this product returns):",
    "",
    "| Op | Envelope |",
    "|---|---|",
    `| list/search | \`${esc(ENVELOPE[c.dialect].list)}\` |`,
    `| get | \`${esc(ENVELOPE[c.dialect].get)}\` |`,
    `| create/update | \`${esc(ENVELOPE[c.dialect].write)}\` |`,
    "",
    `**Tables (SQLite):** ${c.tables.map((t) => `\`${t.name}\``).join(", ")}`,
    "",
  ];
  for (const t of visibleTools) {
    const params = Object.entries(t.params ?? {});
    md.push(`## \`${t.name}\``, "");
    md.push(`*Mirrors:* ${esc(t.mirrors)}`, "");
    md.push(t.description, "");
    md.push(`**Who uses it & why:** ${esc(t.scenario ?? "")}`, "");
    md.push("| Param (real API name) | Type | Required | Internal field |", "|---|---|---|---|");
    if (!params.length) md.push("| *(none)* | | | |");
    for (const [p, ty] of params) {
      const required = (t.op.required ?? []).includes(t.param_map?.[p] ?? p);
      const internal = t.param_map?.[p];
      md.push(`| \`${p}\` | ${esc(typeof ty === "object" ? ty.type : ty)} | ${required ? "yes" : "no"} | ${internal ? `\`${internal}\`` : "same"} |`);
    }
    md.push("");
    if (t.field_map) {
      md.push(`**Field re-keying (LEDES 1998B):** ${Object.entries(t.field_map).slice(0, 6).map(([k, v]) => `\`${k}\`→\`${v}\``).join(", ")}…`, "");
    }
    md.push(`**Op:** \`${t.op.kind}\` on \`${t.op.table}\`${t.op.computed ? ` · computed: ${Object.keys(t.op.computed).join(", ")}` : ""}${t.op.redact ? " · redaction rule applies" : ""}${t.op.require_null ? " · lock conflict (409) enforced" : ""}`, "");
  }
  if (internalTools.length) {
    md.push("## Internal simulator boundary", "");
    md.push("These operations are not published by MCP `tools/list` and cannot be called by an evaluated agent. They actuate deterministic external state or preserve migration-only storage behavior:", "");
    for (const t of internalTools) md.push(`- \`${t.name}\``);
    md.push("");
  }
  writeFileSync(join(OUT, `v3-${f.replace(".json", ".md")}`), md.join("\n") + "\n");
}
index.push("", `**${total} agent-visible tools across ${readdirSync(SRC).filter((x) => x.endsWith(".json")).length} products.**`, "",
  `${internalTotal} internal simulator/migration operations are excluded from MCP discovery and vendor conformance scoring.`, "",
  "Graded by the v3 workflow task pack (`world/expansion/build-v3-tasks.mjs`, 15 tasks) —",
  "see `docs/MCP-JUSTIFICATION.md` for why each product was chosen and how the mock",
  "compares to the real API surface.");
writeFileSync(join(OUT, "V3-README.md"), index.join("\n") + "\n");
console.log(`docs/api/V3-README.md + ${readdirSync(SRC).filter((x) => x.endsWith(".json")).length} product pages · ${total} agent tools · ${internalTotal} internal operations`);
