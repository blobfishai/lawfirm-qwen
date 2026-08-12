#!/usr/bin/env node
/**
 * v3 workflow task pack — tasks graded on the v3 real-API-mirrored product
 * surfaces (Clio/CourtListener/iManage/Relativity/LEDES/Google dialects),
 * instantiating the researched workflows in docs/MCP-JUSTIFICATION.md §Workflow.
 *
 * Emits world/blobfish/world-v3.json = world-lawnative.json + these tasks,
 * each with reference_args (oracle-runnable) and a generated VCode verifier
 * that pins inserts (new row with pinned fields) and updates (row id/field
 * becomes value) on the v3 tables. Answer keys are pinned against the
 * deterministic v3 seed (fixed-seed PRNG — see v2runtime.Rng).
 *
 * Run:   node world/expansion/build-v3-tasks.mjs
 * Prove: python3 world/local/server.py --port 8979 --world world/blobfish/world-v3.json --v2-contracts mcp/v3/contracts
 *        python3 world/local/oracle.py --base http://127.0.0.1:8979 --world world/blobfish/world-v3.json --tasks <v3 ids>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const opt = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return resolve(ROOT, index === -1 ? fallback : process.argv[index + 1]);
};
const WORLD_IN = opt("--in", "world/blobfish/world-lawnative.json");
const WORLD_OUT = opt("--out", "world/blobfish/world-v3.json");
const REFRESH_ONLY = process.argv.includes("--refresh-only");
const raw = JSON.parse(readFileSync(WORLD_IN, "utf8"));
const world = raw.world ?? raw;
const previousVerifierRevision = world.v3_task_pack?.verifier_revision ?? 1;

const py = (s) => JSON.stringify(String(s));
const pyNorm = (v) => (typeof v === "number" ? (Number.isInteger(v) ? v.toFixed(1) : String(v)) : String(v));
const gmailRaw = ({ from, to, subject, body }) => Buffer.from([
  `From: ${from}`, `To: ${to}`, `Subject: ${subject}`,
  "Content-Type: text/plain; charset=utf-8", "", body,
].join("\r\n")).toString("base64url");

function wireArgs(tool, a) {
  const args = { ...a };
  if (tool === "contacts_create") return { body: { data: {
    type: args.type, name: args.name, title: args.title,
    email_addresses: args.primary_email ? [{ name: "Work", address: args.primary_email, default_email: true }] : undefined,
    phone_numbers: args.primary_phone ? [{ name: "Work", number: args.primary_phone, default_number: true }] : undefined,
  } } };
  if (tool === "matters_create") return { body: { data: {
    client: { id: args.client_id }, description: args.display_name || args.description,
    display_number: args.number, practice_area: args.practice_area_id ? { id: args.practice_area_id } : undefined,
    responsible_attorney: args.responsible_attorney_id ? { id: args.responsible_attorney_id } : undefined,
    open_date: args.open_date,
  } } };
  if (tool === "tasks_create") return { body: { data: {
    name: args.name, description: args.description || args.name,
    assignee: { id: args.assignee_user_id, type: "User" },
    matter: { id: args.matter_id }, due_at: args.due_at, priority: args.priority,
  } } };
  if (tool === "notes_create") return { body: { data: {
    contact: { id: args.author_user_id }, matter: { id: args.matter_id }, type: "Matter",
    subject: args.subject, detail: args.detail, date: "2026-08-10",
  } } };
  if (tool === "time_entries_create") return { body: { data: {
    type: "TimeEntry", date: args.date, matter: { id: args.matter_id }, user: { id: args.user_id },
    quantity: args.quantity_hours, price: args.rate, note: args.description,
    activity_description: args.utbms_task_code ? { utbms_task_id: args.utbms_task_code } : undefined,
    non_billable: args.billable === 0,
  } } };
  if (tool === "time_entries_update") return { id: args.id, body: { data: {
    date: args.date, quantity: args.quantity_hours, price: args.rate, note: args.description,
    activity_description: args.utbms_task_code ? { utbms_task_id: args.utbms_task_code } : undefined,
    non_billable: args.billable == null ? undefined : args.billable === 0,
  } } };
  if (tool === "bills_update") return { id: args.id, body: { data: {
    state: args.state, issued_at: args.issue_date, due_at: args.due_date,
  } } };
  if (tool === "communications_create") return { body: { data: {
    matter: { id: args.matter_id }, type: args.type || "EmailCommunication",
    subject: args.subject, body: args.body || "", received_at: args.received_at || "2026-08-10T12:00:00Z",
  } } };
  if (tool === "documents_get" || tool === "documents_download") {
    return { body: { documentId: `LEGAL!${args.id}.1`, latest: true } };
  }
  if (tool === "documents_checkin") return {
    updateOrCreate: "Create New Version", documentId: `LEGAL!${args.id}.1`, file: args.body,
  };
  if (tool === "gmail_messages_list") return { userId: "me", ...args };
  if (tool === "gmail_messages_get") return { userId: "me", ...args, id: String(args.id) };
  if (tool === "gmail_messages_send") return { userId: "me", body: { raw: gmailRaw({
    from: args.from_addr, to: args.to_addr, subject: args.subject, body: args.body,
  }) } };
  return args;
}

function vcode(taskId, family, walk, inserts, updates) {
  const insertBlocks = inserts.map((c, i) => {
    // Every pin for one declared insert must bind to the SAME new row. The
    // former per-field search let row A satisfy `subject` while row B
    // satisfied `matter_id`, so malformed multi-row work could pass.
    const rowMatches = c.pinned.map(([f, v]) =>
      `_norm(r.get(${py(f)})) == _norm(${py(pyNorm(v))})`).join(" and ") || "True";
    const pins = c.pinned.map(([f, v], j) => `
    _p${i}_${j} = [r for r in _new_${i} if ${rowMatches}]
    chk(${py(`${c.table}_new_row_${f}_is_${String(pyNorm(v)).slice(0, 36)}`)}, len(_p${i}_${j}) > 0,
        f"expected one new ${c.table} row matching every declared pin (including ${f}=${String(pyNorm(v)).slice(0, 50)}); saw " + str([_norm(r.get(${py(f)})) for r in _new_${i}][:6]))`).join("");
    return `
    _bi_${i} = _ids(initial_state.get(${py(c.table)}, []))
    _af_${i} = final_state.get(${py(c.table)}, [])
    _new_${i} = [r for r in _af_${i} if str(r.get("id")) not in _bi_${i}]
    chk(${py(`rows_inserted_into_${c.table}`)}, len(_new_${i}) >= 1,
        f"${c.table}: {len(_bi_${i})} -> {len(_af_${i})} rows")${pins}`;
  }).join("\n");

  const updateBlocks = updates.map((u, i) => u.pinned.map(([f, v], j) => `
    _row_u${i} = next((r for r in final_state.get(${py(u.table)}, []) if str(r.get("id")) == ${py(String(u.id))}), None)
    chk(${py(`${u.table}_${u.id}_${f}_is_${String(pyNorm(v)).slice(0, 30)}`)},
        _row_u${i} is not None and _norm(_row_u${i}.get(${py(f)})) == _norm(${py(pyNorm(v))}),
        f"${u.table}[${u.id}].${f} = " + (_norm(_row_u${i}.get(${py(f)})) if _row_u${i} else "(row missing)") + ", expected ${String(pyNorm(v)).slice(0, 40)}")`).join("")).join("\n");

  return `"""VCode verifier for ${taskId} (v3 workflow: ${family})
Walk: ${walk.join(" -> ")}
Grades v3 product tables (real-API-mirrored surfaces)."""

def _ids(rows):
    return {str(r.get("id")) for r in rows if isinstance(r, dict)}

def _norm(v):
    if v is None: return "null"
    if v is True: return "true"
    if v is False: return "false"
    s = str(v).strip().lower()
    try:
        return repr(float(s))  # numeric-affinity-proof: "20" == "20.0"
    except ValueError:
        return s

def verify(initial_state, final_state, trace):
    results, failed = [], []
    def chk(name, passed, detail):
        results.append({"name": name, "passed": bool(passed), "details": detail})
        if not passed: failed.append(name)

    steps = [s for s in trace if s.get("tool") != "_final_answer" and s.get("ok")]
    tools = [s.get("tool", "") for s in steps]
    chk("state_changed", initial_state != final_state,
        "world state changed" if initial_state != final_state else "NO state change")

    _path = ${JSON.stringify(walk)}
    _cur = 0
    for _t in tools:
        if _cur < len(_path) and _t == _path[_cur]:
            _cur += 1
    chk("required_workflow_path", _cur == len(_path),
        "completed: " + " -> ".join(_path) if _cur == len(_path)
        else "INCOMPLETE: missing " + " -> ".join(_path[_cur:]))
${insertBlocks}
${updateBlocks}

    _destroyed = []
    for _t in set(list(initial_state.keys()) + list(final_state.keys())):
        if len(final_state.get(_t, [])) < len(initial_state.get(_t, [])):
            _destroyed.append(_t)
    chk("no_rows_destroyed", not _destroyed,
        "no rows destroyed" if not _destroyed else f"ROWS DESTROYED in {_destroyed}")

    _ANTI = {"required_workflow_path"}
    core = [r for r in results if r["name"] not in _ANTI | {"state_changed", "no_rows_destroyed"}]
    core_failed = [r for r in core if not r["passed"]]
    anti_failed = [r for r in results if r["name"] in _ANTI and not r["passed"]]
    guard_failed = [r for r in results if r["name"] == "no_rows_destroyed" and not r["passed"]]
    if anti_failed or guard_failed:
        reward = 0.0
    elif core:
        reward = (len(core) - len(core_failed)) / len(core)
    else:
        reward = 0.0 if failed else 1.0
    return {"task_id": ${py(taskId)}, "passed": len(failed) == 0, "reward": round(reward, 4),
            "explanation": "All checks passed" if not failed else "Failed: " + ", ".join(failed),
            "failed_conditions": failed, "advisory_conditions": [], "assertions": results}
`;
}

// ---------------------------------------------------------------- the tasks
// Answer keys extracted from the deterministic v3 seed (2026-08-10, fixed PRNG).
const TASKS = [
  {
    id: "task_v3_001", family: "clio-intake-conflicts-open",
    prompt: 'New engagement intake for existing client "Corvess Analytics": (1) search contacts for any record matching "Talvern" (the adverse party) to check conflicts; (2) create a Person contact for the client\'s new GC — name "Elena Voss", email "elena.voss@corvess.example", title exactly "GC"; (3) open a new matter for the client: display_name exactly "Corvess Analytics Securities Matter", client_id 20, practice_area_id 5, responsible_attorney_id 3; (4) assign a kickoff task on the new matter to user 3 named exactly "Circulate engagement letter" due 2026-08-20. Perform the steps in this order.',
    walk: ["contacts_search", "contacts_create", "matters_create", "tasks_create"],
    args: [
      { query: "Talvern" },
      { type: "Person", name: "Elena Voss", primary_email: "elena.voss@corvess.example", title: "GC", company_name: "Corvess Analytics" },
      { display_name: "Corvess Analytics Securities Matter", client_id: 20, practice_area_id: 5, responsible_attorney_id: 3 },
      { matter_id: 29, assignee_user_id: 3, name: "Circulate engagement letter", due_at: "2026-08-20" },
    ],
    inserts: [
      { table: "pm_contacts", pinned: [["name", "Elena Voss"], ["title", "GC"]] },
      { table: "pm_matters", pinned: [["display_name", "Corvess Analytics Securities Matter"], ["client_id", 20]] },
      { table: "pm_tasks", pinned: [["name", "Circulate engagement letter"], ["assignee_user_id", 3]] },
    ],
    updates: [],
  },
  {
    id: "task_v3_002", family: "clio-time-and-bill",
    prompt: 'Record today\'s work and move the prebill: (1) get matter 1 to confirm it is open and hourly; (2) create a time entry on matter 1 for user 2, date "2026-08-10", 2.5 hours at rate 400, description "Draft motion to dismiss section II; cite-check", UTBMS task code exactly "L240"; (3) then move bill 3 from draft to state exactly "awaiting_approval".',
    walk: ["matters_get", "time_entries_create", "bills_update"],
    args: [
      { id: 1 },
      { matter_id: 1, user_id: 2, date: "2026-08-10", quantity_hours: 2.5, rate: 400, description: "Draft motion to dismiss section II; cite-check", utbms_task_code: "L240" },
      { id: 3, state: "awaiting_approval" },
    ],
    inserts: [{ table: "pm_time_entries", pinned: [["utbms_task_code", "L240"], ["quantity_hours", 2.5], ["total", 1000]] }],
    updates: [{ table: "pm_bills", id: 3, pinned: [["state", "awaiting_approval"]] }],
  },
  {
    id: "task_v3_003", family: "clio-utbms-recode",
    prompt: 'Billing compliance: time entry 5 is miscoded. Get the entry, read its narrative, and recode it: the narrative describes a client strategy call, which under the UTBMS litigation code set is Analysis/Strategy — task code exactly "L120" (it is currently coded as trial attendance). Update only the task code.',
    walk: ["time_entries_get", "time_entries_update"],
    args: [{ id: 5 }, { id: 5, utbms_task_code: "L120" }],
    inserts: [],
    updates: [{ table: "pm_time_entries", id: 5, pinned: [["utbms_task_code", "L120"]] }],
  },
  {
    id: "task_v3_004", family: "clio-trust-overdraft",
    prompt: 'Trust compliance check: list every trust transaction for matter 10 and compute the balance yourself. A client ledger must never be negative. If (and only if) the balance is negative, record a note on matter 10 authored by user 1 with subject exactly "TRUST OVERDRAFT ALERT" and a detail stating the computed balance. Do not post any trust transaction.',
    walk: ["trust_transactions_list", "notes_create"],
    args: [
      { matter_id: 10 },
      { matter_id: 10, author_user_id: 1, subject: "TRUST OVERDRAFT ALERT", detail: "Client trust ledger for matter 10 computes to -25750.44; freeze disbursements and escalate to the trust accountant." },
    ],
    inserts: [{ table: "pm_notes", pinned: [["subject", "TRUST OVERDRAFT ALERT"], ["matter_id", 10]] }],
    updates: [],
  },
  {
    id: "task_v3_005", family: "relativity-privilege-log",
    prompt: 'Privilege workflow in the review workspace: document 2 in workspace 3 is coded privileged. (1) Get the document to confirm its coding; (2) code it as reviewed by exactly "second.level" (leave responsive and privileged as they are — pass them back unchanged: responsive "yes", privileged "yes"); (3) log it on the privilege log for workspace 3 with basis exactly "attorney-client" and description "Counsel email re litigation strategy — withheld in full."',
    walk: ["review_documents_get", "documents_code", "privilege_log_create"],
    args: [
      { id: 2 },
      { id: 2, responsive: "yes", privileged: "yes", reviewed_by: "second.level" },
      { workspace_id: 3, document_id: 2, basis: "attorney-client", description: "Counsel email re litigation strategy — withheld in full." },
    ],
    inserts: [{ table: "ed_privilege_log", pinned: [["document_id", 2], ["basis", "attorney-client"]] }],
    updates: [{ table: "ed_documents", id: 2, pinned: [["reviewed_by", "second.level"]] }],
  },
  {
    id: "task_v3_006", family: "ledes-reconciliation-gate",
    prompt: 'Pre-submission billing validation for Clio bill 2: get the bill header, list every line item, and independently sum the line amounts. The bill total is $56,903.18. If the line sum differs, do not generate a LEDES file. Record a matter note on matter 5 authored by user 1, subject exactly "LEDES TOTAL MISMATCH", with detail stating both the computed line sum and header total.',
    walk: ["bills_get", "bill_line_items_list", "notes_create"],
    args: [
      { id: 2 },
      { bill_id: 2, limit: 100 },
      { matter_id: 5, author_user_id: 1, subject: "LEDES TOTAL MISMATCH", detail: "Bill 2 line items total $26,060.90, which does not match the $56,903.18 header total; LEDES generation blocked." },
    ],
    inserts: [{ table: "pm_notes", pinned: [["subject", "LEDES TOTAL MISMATCH"], ["matter_id", 5]] }],
    updates: [],
  },
  {
    id: "task_v3_007", family: "courtlistener-cite-check",
    prompt: 'Cite-check two citations from a draft brief using the citation lookup: "410 U.S. 113" and "999 Sim. 9d 999". A citation that does not resolve must be flagged, never guessed. Record the result as a note on matter 1 authored by user 1 with subject exactly "CITE CHECK: 1 verified, 1 unresolved" and a detail naming which citation failed.',
    walk: ["citation_lookup", "citation_lookup", "notes_create"],
    args: [
      { text: "410 U.S. 113" },
      { text: "999 Sim. 9d 999" },
      { matter_id: 1, author_user_id: 1, subject: "CITE CHECK: 1 verified, 1 unresolved", detail: "410 U.S. 113 resolves; 999 Sim. 9d 999 does not resolve in the citation database and must not be cited." },
    ],
    inserts: [{ table: "pm_notes", pinned: [["subject", "CITE CHECK: 1 verified, 1 unresolved"]] }],
    updates: [],
  },
  {
    id: "task_v3_008", family: "imanage-version-cycle",
    prompt: 'Version discipline in the DMS: revise document 5 ("Settlement Model — Fairview Works"). (1) Get the document; (2) check it out under exactly "aiko.tanaka"; (3) check it back in with latest_version exactly 2 and body "Settlement Model — revised assumptions per partner comments (v2)."; keep checked_out_by "aiko.tanaka" on the checkin record; (4) list its version history.',
    walk: ["documents_get", "documents_checkout", "documents_checkin", "document_versions_list"],
    args: [
      { id: 5 },
      { id: 5, checked_out_by: "aiko.tanaka" },
      { id: 5, checked_out_by: "aiko.tanaka", latest_version: 2, body: "Settlement Model — revised assumptions per partner comments (v2)." },
      { document_id: 5 },
    ],
    inserts: [],
    updates: [{ table: "dm_documents", id: 5, pinned: [
      ["latest_version", 2],
      ["body", "Settlement Model — revised assumptions per partner comments (v2)."],
    ] }],
  },
  {
    id: "task_v3_009", family: "courtlistener-docket-watch",
    prompt: 'Docket monitoring: find the docket for "Talvern Logistics v. Halcyon Therapeutics" (search by case name). Before subscribing, inspect the current CourtListener user\'s existing docket alerts to learn the exact alert_type vocabulary this system uses — do not invent a value. Then subscribe that authenticated user to docket 7 using alert_type 1 (subscription).',
    walk: ["dockets_search", "docket_alerts_list", "docket_alerts_create"],
    args: [
      { q: "Talvern Logistics v. Halcyon" },
      {},
      { docket: 7, alert_type: 1 },
    ],
    inserts: [{ table: "cl_docket_alerts", pinned: [["docket_id", 7], ["alert_type", 1]] }],
    updates: [],
  },
  {
    id: "task_v3_010", family: "gmail-evidence-to-matter",
    prompt: 'Evidence hygiene: the client\'s settlement-authority email must be logged to the matter record, not live only in the inbox. (1) Search mail for "Settlement posture"; (2) get message 9 in full; (3) log it on matter 1 as a communication of type exactly "EmailCommunication" with subject exactly "Settlement posture — client authority email logged" and the message body captured in the body field.',
    walk: ["gmail_messages_list", "gmail_messages_get", "communications_create"],
    args: [
      { q: "Settlement posture" },
      { id: 9 },
      { matter_id: 1, type: "EmailCommunication", subject: "Settlement posture — client authority email logged", body: "Logged from mailbox message 9: client settlement authority thread." },
    ],
    inserts: [{ table: "pm_communications", pinned: [["type", "EmailCommunication"], ["subject", "Settlement posture — client authority email logged"]] }],
    updates: [],
  },
  // ---- growth round 2: ambiguity escalation (r1 finding: length is easy;
  // withheld ids, derived values, and policy scans are the levers) ----
  {
    id: "task_v3_011", family: "r2-withheld-id-utbms-audit",
    prompt: 'Billing compliance audit on matter 10: exactly one time entry on this matter describes deposition preparation ("Prepare deposition outline; review key exhibits") but is not coded to the UTBMS Depositions code. List the matter\'s time entries, identify that entry yourself, and recode it to task code exactly "L330". Change nothing else.',
    walk: ["time_entries_list", "time_entries_update"],
    args: [ { matter_id: 10 }, { id: 2, utbms_task_code: "L330" } ],
    inserts: [],
    updates: [{ table: "pm_time_entries", id: 2, pinned: [["utbms_task_code", "L330"]] }],
  },
  {
    id: "task_v3_012", family: "r2-derived-prebill",
    prompt: 'Prepare the prebill handoff for matter 5: list its time entries, sum the totals of entries that are billable and not yet billed, then email billing.ops@simulated-firm.example from associate@simulated-firm.example. Use subject exactly "PREBILL REQUEST — MATTER 5 — $4,730.50" and state the computed subtotal, issue date 2026-08-11, due date 2026-09-10, and client_id 16 in the body. Clio exposes no public bill-creation API, so do not invent one.',
    walk: ["time_entries_list", "gmail_messages_send"],
    args: [
      { matter_id: 5, billable: 1, billed: 0 },
      { from_addr: "associate@simulated-firm.example", to_addr: "billing.ops@simulated-firm.example", subject: "PREBILL REQUEST — MATTER 5 — $4,730.50", body: "Matter 5 prebill subtotal: $4,730.50; client_id: 16; issue date: 2026-08-11; due date: 2026-09-10." },
    ],
    inserts: [{ table: "ws_messages", pinned: [["subject", "PREBILL REQUEST — MATTER 5 — $4,730.50"], ["to_addr", "billing.ops@simulated-firm.example"]] }],
    updates: [],
  },
  {
    id: "task_v3_013", family: "r2-policy-scan-expenses",
    prompt: 'Firm expense policy: out-of-town travel expenses (UTBMS code E110) over $1,000 require partner review. Scan the expense entries for E110 charges exceeding $1,000 and file ONE review note per qualifying expense on its matter, authored by user 1, subject exactly "EXPENSE POLICY REVIEW", detail naming the expense id and amount. There are one or more qualifying expenses; find them all yourself.',
    walk: ["expense_entries_list", "notes_create", "notes_create", "notes_create"],
    args: [
      { utbms_expense_code: "E110" },
      { matter_id: 2, author_user_id: 1, subject: "EXPENSE POLICY REVIEW", detail: "Expense 7 ($1,599.96 E110 travel) exceeds the $1,000 partner-review threshold." },
      { matter_id: 14, author_user_id: 1, subject: "EXPENSE POLICY REVIEW", detail: "Expense 29 ($1,413.95 E110 travel) exceeds the $1,000 partner-review threshold." },
      { matter_id: 19, author_user_id: 1, subject: "EXPENSE POLICY REVIEW", detail: "Expense 37 ($2,149.15 E110 travel) exceeds the $1,000 partner-review threshold." },
    ],
    inserts: [
      { table: "pm_notes", pinned: [["subject", "EXPENSE POLICY REVIEW"], ["matter_id", 2]] },
      { table: "pm_notes", pinned: [["subject", "EXPENSE POLICY REVIEW"], ["matter_id", 14]] },
      { table: "pm_notes", pinned: [["subject", "EXPENSE POLICY REVIEW"], ["matter_id", 19]] },
    ],
    updates: [],
  },
  {
    id: "task_v3_014", family: "r2-withheld-id-docket",
    prompt: 'Docket intake: our client Meridian Cloud has been sued — find the docket where Meridian Cloud is the DEFENDANT (case name ends "v. Meridian Cloud"), confirm its filing date by getting the docket, and subscribe the current authenticated CourtListener user to it with alert_type 1. Do not subscribe on any docket where Meridian Cloud is the plaintiff.',
    walk: ["dockets_search", "dockets_get", "docket_alerts_create"],
    args: [
      { q: "v. Meridian Cloud" },
      { id: 1 },
      { docket: 1, alert_type: 1 },
    ],
    inserts: [{ table: "cl_docket_alerts", pinned: [["docket_id", 1], ["alert_type", 1]] }],
    updates: [],
  },
  {
    id: "task_v3_015", family: "r2-trust-sweep-all-matters",
    prompt: 'Quarterly trust sweep: a client trust ledger must never be negative. Review the trust transactions across ALL matters (list them — mind the default page size — and compute per-matter balances yourself) and file one alert note per overdrawn matter: authored by user 1, subject exactly "TRUST OVERDRAFT ALERT", filed on that overdrawn matter, detail stating that matter\'s computed balance. Post no trust transactions. Find every overdrawn matter; miss none, and do not flag a matter whose ledger is positive.',
    walk: ["trust_transactions_list", "notes_create", "notes_create"],
    args: [
      { limit: 100 },
      { matter_id: 10, author_user_id: 1, subject: "TRUST OVERDRAFT ALERT", detail: "Matter 10 client ledger computes to -25750.44; freeze disbursements." },
      { matter_id: 17, author_user_id: 1, subject: "TRUST OVERDRAFT ALERT", detail: "Matter 17 client ledger computes to -42300.06; freeze disbursements." },
    ],
    inserts: [
      { table: "pm_notes", pinned: [["subject", "TRUST OVERDRAFT ALERT"], ["matter_id", 10]] },
      { table: "pm_notes", pinned: [["subject", "TRUST OVERDRAFT ALERT"], ["matter_id", 17]] },
    ],
    updates: [],
    forbidden_note: "flagging a positive-balance matter is graded by the pinned matter_ids",
  },
];

// ---------------------------------------------------------------- assemble
let added = 0;
let refreshed = 0;
for (const t of TASKS) {
  const generatedTask = {
    task_id: t.id,
    outcome_class: "eligible_action",
    prompt: t.prompt,
    goal: t.prompt.slice(0, 110),
    required_tools: [...new Set(t.walk)],
    complexity: "medium",
    method: "v3_workflow",
    walk: t.walk,
    reference_args: t.args.map((args, index) => wireArgs(t.walk[index], args)),
    tables_affected: [...new Set([...t.inserts.map((x) => x.table), ...t.updates.map((x) => x.table)])],
    effects: [
      ...t.inserts.map((x) => ({ table: x.table, op: "insert" })),
      ...t.updates.map((x) => ({ table: x.table, op: "update", id: x.id })),
    ],
    provenance: { source_workflow: `workflow_research: ${t.family}` },
    difficulty_tier: "medium",
    acceptance_label: "pending_calibration",
    v3: { family: t.family, dialect_surface: true },
  };
  const taskIndex = world.tasks.findIndex((task) => task.task_id === t.id);
  if (taskIndex === -1) {
    if (REFRESH_ONLY) throw new Error(`cannot refresh missing task ${t.id}`);
    world.tasks.push(generatedTask);
    added++;
  } else {
    // Preserve later lineage additions (especially per-task seed bundles).
    // The structured TASKS manifest remains the verifier source of truth.
    const existing = world.tasks[taskIndex];
    world.tasks[taskIndex] = { ...existing, ...generatedTask, seed: existing.seed };
    refreshed++;
  }

  const assertions = [
    "state_changed", "required_workflow_path",
    ...t.inserts.flatMap((insert) => [
      `rows_inserted_into_${insert.table}`,
      ...insert.pinned.map(([field, value]) =>
        `${insert.table}_new_row_${field}_is_${String(pyNorm(value)).slice(0, 36)}`),
    ]),
    ...t.updates.flatMap((update) => update.pinned.map(([field, value]) =>
      `${update.table}_${update.id}_${field}_is_${String(pyNorm(value)).slice(0, 30)}`)),
    "no_rows_destroyed",
  ];
  const generatedVerifier = {
    task_id: t.id,
    assertions,
    vcode: vcode(t.id, t.family, t.walk, t.inserts, t.updates),
    generated_by: "world/expansion/build-v3-tasks.mjs",
  };
  const verifierIndex = world.verifiers.findIndex((verifier) => verifier.task_id === t.id);
  if (verifierIndex === -1) {
    if (REFRESH_ONLY) throw new Error(`cannot refresh missing verifier ${t.id}`);
    world.verifiers.push(generatedVerifier);
  } else {
    world.verifiers[verifierIndex] = {
      ...world.verifiers[verifierIndex],
      ...generatedVerifier,
    };
  }
}
world.v3_task_pack = {
  generated_at: "2026-08-10",
  tasks: TASKS.map((t) => t.id),
  verifier_revision: 3,
  note: "Workflow tasks graded on the v3 real-API-mirrored surfaces; answer keys are same-row bound and document writes pin their required content against the deterministic v3 seed.",
};
world.version = (world.version ?? 21) + ((added > 0 || previousVerifierRevision < 3) ? 1 : 0);
writeFileSync(WORLD_OUT, JSON.stringify(raw, null, 1));
console.log(`${WORLD_OUT}: ${world.tasks.length} tasks (${added} added, ${refreshed} refreshed), ${world.verifiers.length} verifiers`);
