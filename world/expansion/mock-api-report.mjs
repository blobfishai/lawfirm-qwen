#!/usr/bin/env node
/**
 * Mock-API report — the complete, honest answer to "what are the mock tools,
 * what's their API, how much of the REAL services are we mocking, and what
 * backs them":
 *
 *   docs/api/README.md       the seven answers + mock-vs-real coverage table
 *   docs/api/<system>.md     per-system API documentation generated from the
 *                            actual tool contracts (signature, params, I/O
 *                            format, example, SQL backing, executor, anchor tier)
 *
 * Run: node world/expansion/mock-api-report.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const worldRaw = JSON.parse(readFileSync(join(ROOT, "world", "blobfish", "world-expanded.json"), "utf8"));
const world = worldRaw.world ?? worldRaw;
const systems = JSON.parse(readFileSync(join(ROOT, "mcp", "systems.json"), "utf8")).systems;
const API_DIR = join(ROOT, "docs", "api");
mkdirSync(API_DIR, { recursive: true });

const anchorById = Object.fromEntries((world.anchors?.items ?? []).map((a) => [a.id, a]));
const tableByName = Object.fromEntries(world.tables.map((t) => [t.name, t]));
const esc = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");

// executor family in world/local/server.py per tool name
function executorFamily(name, type) {
  if (/_audit_list$/.test(name)) return "_audit_list (filtered SELECT)";
  if (/_list$/.test(name) && type !== "write") return "_entity_list (SELECT w/ status filter + preview clipping)";
  if (/_get$/.test(name)) return "_entity_get (SELECT by pk)";
  if (name === "read_matter_document") return "_read_record (full-body SELECT)";
  if (name === "read_file") return "_read_file (SELECT by filename)";
  if (/^query_/.test(name)) return "_query (column filters; LIKE for text; long text → previews)";
  if (/^search_/.test(name)) return "_search (LIKE across text columns)";
  if (/^lookup_/.test(name)) return "_lookup_join (pk SELECT + FK join)";
  if (/_records_agent$/.test(name)) return "_records_agent (keyword scan across target tables, previews)";
  if (name === "draft_matter_document") return "_insert into matter_documents";
  if (/_create$/.test(name)) return "_insert (id generation + created_at, required-arg enforcement)";
  if (/^update_/.test(name)) return "_update (single-row UPDATE by pk)";
  if (/_workflow_agent$/.test(name)) return "acknowledgment surface (no mutation)";
  return "_insert / structured ack (see server.py dispatch)";
}

function anchorTier(tool) {
  const refs = (tool.anchor_refs ?? []).map((id) => anchorById[id]).filter(Boolean);
  const external = refs.filter((a) => a.source_url && !String(a.source_url).startsWith("blobfish://"));
  const forge = refs.filter((a) => String(a.source_url ?? "").startsWith("blobfish://"));
  return { external, forge, none: refs.length === 0 };
}

let externalCount = 0, forgeOnly = 0, unanchored = 0;
for (const t of world.tools) {
  const tier = anchorTier(t);
  if (tier.external.length) externalCount++;
  else if (tier.forge.length) forgeOnly++;
  else unanchored++;
}

// ---------------------------------------------------------- per-system pages
for (const [sys, spec] of Object.entries(systems)) {
  const md = [];
  md.push(`# ${spec.product} — mock API documentation`);
  md.push("");
  md.push(esc(spec.description));
  md.push("");
  md.push(`Served by \`node mcp/serve-system.mjs --system ${sys}\` (stdio MCP) over the world runtime`);
  md.push("(`world/local/server.py`). Every call executes against a per-session SQLite copy of the");
  md.push("world database; task-aware sessions overlay the task's seed bundle. Deterministic friction");
  md.push("applies (3% injected rate_limited/stale_reference, 15% ambiguous write-acks, write cap).");
  md.push("");
  for (const name of spec.tools) {
    const tool = world.tools.find((t) => t.name === name);
    if (!tool) continue;
    let params = tool.parameters ?? {};
    if (Array.isArray(params)) params = Object.fromEntries(params.map((p) => [p.name, p.type]));
    const required = tool.type === "write" ? Object.keys(params) : [];
    const tier = anchorTier(tool);
    md.push(`## \`${name}\``);
    md.push("");
    md.push(esc(tool.description ?? ""));
    md.push("");
    md.push("| Param | Type | Required |");
    md.push("|---|---|---|");
    for (const [p, ty] of Object.entries(params)) {
      md.push(`| \`${p}\` | ${esc(typeof ty === "object" ? ty.type : ty)} | ${required.includes(p) ? "yes" : "no"} |`);
    }
    if (!Object.keys(params).length) md.push("| *(none)* | | |");
    md.push("");
    if (tool.input_format) md.push(`**Input:** ${esc(String(tool.input_format).slice(0, 200))}`);
    if (tool.output_format) md.push(`**Output:** ${esc(String(tool.output_format).slice(0, 200))}`);
    if (tool.example_usage) md.push(`**Example:** \`${esc(String(tool.example_usage).slice(0, 160))}\``);
    md.push("");
    const tables = (tool.target_tables ?? []).map((tb) =>
      `\`${tb}\` (${tableByName[tb]?.row_count ?? "?"} rows)`);
    md.push(`**SQL backing:** ${tables.slice(0, 4).join(", ")}${tables.length > 4 ? ` +${tables.length - 4} more` : ""} — SQLite, per-session copy.`);
    md.push(`**Executor:** \`${executorFamily(name, tool.type)}\``);
    const anchoring = tier.external.length
      ? `external research: ${tier.external.slice(0, 2).map((a) => `[${esc(a.label)}](${a.source_url})`).join("; ")}`
      : tier.forge.length
        ? `blobfish service-forge catalog (internal archetype schema \`law_firm_core\`)`
        : "*none — execution-tested only*";
    md.push(`**Anchoring:** ${anchoring}`);
    md.push("");
  }
  writeFileSync(join(API_DIR, `${sys}.md`), md.join("\n") + "\n");
}

// ------------------------------------------------------------------ README
const realSurface = [
  ["practice-management", "Clio (real API v4)", "~200+ REST endpoints (matters, contacts, activities, bills, calendars, documents, trust, webhooks)", "16"],
  ["litigation-docketing", "CourtAlert / CalendarRules-class", "rules engines: thousands of court rules, trigger APIs, recalcs", "42"],
  ["discovery-platform", "Relativity (real API)", "hundreds of endpoints (workspaces, documents, productions, imaging, dtSearch)", "7"],
  ["billing", "LEDES/e-billing platforms", "invoice submission, UTBMS validation, appeals workflows", "9"],
  ["dms", "iManage Work API", "~100+ endpoints (documents, versions, workspaces, security, search)", "4"],
  ["office-suite", "Google Workspace APIs", "Docs/Sheets/Drive/Calendar: hundreds of methods", "7"],
  ["hr-directory", "HRIS APIs (BambooHR-class)", "dozens of endpoints", "9"],
  ["knowledge-assistant", "KM platforms", "varies", "8"],
];

const md = [];
md.push("# Mock services — the seven answers");
md.push("");
md.push("## 1–2 · Where are the mock tools, and the full list");
md.push("");
md.push(`All **${world.tools.length} tools** are defined as contracts in \`world/blobfish/world-expanded.json\``);
md.push("(`tools[]`), executed by the synthesizer in `world/local/server.py` (`ToolRuntime.call` dispatch),");
md.push("served over MCP by the 8 per-system servers in `mcp/` (`systems.json` is the partition), and");
md.push("documented per system in this folder:");
md.push("");
for (const [sys, spec] of Object.entries(systems)) {
  md.push(`- [\`${sys}\`](./${sys}.md) — ${spec.tools.length} tools — ${esc(spec.product)}`);
}
md.push("");
md.push("## 3 · The tools' API");
md.push("");
md.push("Each per-system page documents every tool: description, parameter table (types + required),");
md.push("input/output format, example call, SQL backing, executor family, and anchoring. The MCP");
md.push("schema exposed to agents is generated from the same contracts (`server.py` tools/list).");
md.push("");
md.push("## 4 · The real MCP servers found in research");
md.push("");
md.push("The generation-time research corpus contains **4 real MCP servers** (with real tool schemas");
md.push("captured for some): `gbrussich52/legalaimcp`, `mcp-dir/astrea-mcp`, `offshoreproz/agent-company`");
md.push("(all on smithery.ai) — legal-AI *directory/marketplace* servers, not practice-management");
md.push("products. **None of their tools were mocked.** The fourth 'server' anchor is blobfish's own");
md.push("`law_firm_core` Service Forge archetype (internal).");
md.push("");
md.push("## 5 · Mock API documentation");
md.push("");
md.push("This folder — generated from the live contracts by `node world/expansion/mock-api-report.mjs`.");
md.push("");
md.push("## 6 · How much of the REAL services are we mocking (the honest number)");
md.push("");
md.push("**At API-shape level: effectively 0%.** The tools mirror blobfish's internal `law_firm_core`");
md.push(`archetype (74 tool schemas + 60 entity schemas in the anchor corpus, all \`blobfish://\` URIs),`);
md.push("not any vendor's API. Anchoring tiers across the 102 tools:");
md.push("");
md.push(`- external-research-anchored: **${externalCount}** (and those anchors are directory servers, not the mocked product)`);
md.push(`- internal forge-catalog-anchored: **${forgeOnly}**`);
md.push(`- unanchored (execution-tested only): **${unanchored}**`);
md.push("");
md.push("Conceptual overlap with real products is the generic CRUD/query subset. What real APIs have");
md.push("that the mocks do not: vendor object models and field names, auth/scopes, pagination cursors,");
md.push("search DSLs (SOQL/dtSearch), webhooks, bulk endpoints, rate-limit semantics beyond our seeded");
md.push("friction, file/binary handling. Approximate scale comparison:");
md.push("");
md.push("| System | Real product (reference) | Real API surface (approx.) | Our mock tools |");
md.push("|---|---|---|---|");
for (const [sys, prod, surface, n] of realSurface) md.push(`| ${sys} | ${prod} | ${surface} | ${n} |`);
md.push("");
md.push("This is exactly the gap the creation workflow closes for the sales world");
md.push("(`docs/SALES-WORLD-DESIGN.md` §2: tools mocked 1:1 from each product's MCP/API docs).");
md.push("");
md.push("## 7 · SQL backing");
md.push("");
md.push("**Yes — every tool executes against SQLite.** 74 tables, "
  + `${world.tables.reduce((a, t) => a + (t.row_count ?? 0), 0).toLocaleString()} seeded rows; `
  + "pristine seed at `world/local/state/<world>/seed.db`, one copied DB per episode session,");
md.push("task-seed bundles upserted at session creation, verifier snapshots diff the same DB.");
md.push("Known deviation from the target architecture: ONE shared substrate rather than one DB per");
md.push("product (per-system storage is the sales-world design; see also `docs/DOMAIN-AUDIT.md` for");
md.push("the two ERP-template tables in this substrate).");
md.push("");
md.push("*Generated by `node world/expansion/mock-api-report.mjs` from the world document.*");
writeFileSync(join(API_DIR, "README.md"), md.join("\n") + "\n");

console.log(`docs/api/: README + ${Object.keys(systems).length} system pages · anchoring tiers: external ${externalCount} / forge ${forgeOnly} / none ${unanchored}`);
