#!/usr/bin/env node
/**
 * v3 builder — deep-copies the v2 contracts into mcp/v3/contracts with a
 * 1:1 mapping to each real API's wire format:
 *   - external parameter names exactly as the real API spells them
 *     (param_map: external -> internal, applied by the runtime)
 *   - a `dialect` per contract; the runtime wraps every response in that
 *     product's real envelope (Clio {data,meta}; CourtListener
 *     {count,next,previous,results}; iManage {data:{results,total}};
 *     Relativity {Objects,TotalCount}; LEDES field names; Google resources)
 *
 * v2 stays untouched (measured-history surface); v3 is the fidelity copy.
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "v2", "contracts");
const DST = join(HERE, "contracts");
mkdirSync(DST, { recursive: true });

const DIALECT = {
  "practice-management-v2": "clio",
  "docket-records-v2": "courtlistener",
  "dms-v2": "imanage",
  "ediscovery-v2": "relativity",
  "ebilling-v2": "ledes",
  "workspace-v2": "google",
};

// external name -> internal name, per tool (identity if omitted).
// External spellings taken from the real API docs cited in each contract.
const PARAM_RENAMES = {
  // CourtListener: Django-filter style params, `q` for search
  dockets_list: { court: "court_id", date_filed__gte: "date_filed_after", date_filed__lte: "date_filed_before" },
  dockets_search: { q: "query" },
  docket_entries_list: { docket: "docket_id", date_filed__gte: "filed_after", date_filed__lte: "filed_before" },
  recap_documents_list: { docket_entry: "docket_entry_id" },
  opinions_search: { q: "query" },
  citation_lookup: { text: "citation" },
  parties_list: { docket: "docket_id" },
  docket_alerts_create: { docket: "docket_id" },
  docket_alerts_list: { docket: "docket_id" },
  // iManage: `anywhere` full-text param
  documents_search: { anywhere: "query" },
  workspaces_search: { name: "query" },
  // Relativity Object Manager: paging is start/length
  documents_query: { length: "limit" },
  review_documents_search: { length: "limit" },
  // Google: camelCase params; Gmail `q`; Calendar timeMin/timeMax
  sheets_values_get: { spreadsheetId: "spreadsheet_id" },
  sheets_values_update: { spreadsheetId: "spreadsheet_id" },
  drive_files_list: { q: "query" },
  drive_files_get: { fileId: "id" },
  gmail_messages_list: { q: "query", maxResults: "limit" },
  gmail_messages_get: {},
  calendar_events_list: { calendarId: "calendar", timeMin: "time_min", timeMax: "time_max", maxResults: "limit" },
  calendar_events_insert: { calendarId: "calendar" },
};

// LEDES 1998B field names for line items (ledes.org 24-field record)
const LEDES_LINE_FIELDS = {
  id: "LINE_ITEM_NUMBER", invoice_id: "INVOICE_ID", line_date: "LINE_ITEM_DATE",
  timekeeper: "TIMEKEEPER_NAME", task_code: "LINE_ITEM_TASK_CODE",
  activity_code: "LINE_ITEM_ACTIVITY_CODE", hours: "LINE_ITEM_NUMBER_OF_UNITS",
  rate: "LINE_ITEM_UNIT_COST", amount: "LINE_ITEM_TOTAL", narrative: "LINE_ITEM_DESCRIPTION",
};
const LEDES_INVOICE_FIELDS = {
  id: "INVOICE_ID", invoice_number: "INVOICE_NUMBER", matter_number: "LAW_FIRM_MATTER_ID",
  client_matter_id: "CLIENT_MATTER_ID", billing_start: "BILLING_START_DATE",
  billing_end: "BILLING_END_DATE", total: "INVOICE_TOTAL", status: "INVOICE_STATUS",
  validation_errors: "VALIDATION_ERRORS", submitted_at: "SUBMITTED_AT",
};

let products = 0, tools = 0, renamed = 0;
for (const f of readdirSync(SRC).filter((x) => x.endsWith(".json"))) {
  const c = JSON.parse(readFileSync(join(SRC, f), "utf8"));
  c.$schema = "lawfirm-qwen.mcp-contract.v3";
  c.system = c.system.replace(/-v2$/, "-v3");
  c.dialect = DIALECT[Object.keys(DIALECT).find((k) => f.startsWith(k.replace(/-v2$/, "")))] ?? DIALECT[c.system.replace(/-v3$/, "-v2")];
  if (!c.dialect) c.dialect = Object.entries(DIALECT).find(([k]) => k.includes(f.replace(".json", "")))?.[1];
  c.fidelity = "v3: 1:1 external parameter names + real response envelopes per the cited API docs";
  for (const t of c.tools) {
    const ren = PARAM_RENAMES[t.name];
    if (ren) {
      const inv = Object.fromEntries(Object.entries(ren).map(([ext, int]) => [int, ext]));
      const newParams = {};
      for (const [p, ty] of Object.entries(t.params ?? {})) newParams[inv[p] ?? p] = ty;
      t.params = newParams;
      t.param_map = ren; // external -> internal
      renamed++;
    }
    if (c.dialect === "ledes") {
      if (t.op.table === "eb_invoice_lines") t.field_map = LEDES_LINE_FIELDS;
      if (t.op.table === "eb_invoices") t.field_map = LEDES_INVOICE_FIELDS;
    }
    tools++;
  }
  writeFileSync(join(DST, f), JSON.stringify(c, null, 1));
  products++;
  console.log(`${c.system}: dialect=${c.dialect}, tools=${c.tools.length}`);
}
console.log(`v3: ${products} products, ${tools} tools, ${renamed} tools with 1:1 param renames`);
