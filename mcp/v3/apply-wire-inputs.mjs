#!/usr/bin/env node
/** Apply declarative vendor-body adapters to the checked-in v3 contracts. */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CONTRACTS = path.join(ROOT, "mcp/v3/contracts");

const objectBody = { type: "object", description: "Vendor request body; full schema is generated from the pinned public specification." };

const clio = {
  audit_events_list: { agent_visible: false },
  bills_create: { agent_visible: false },
  trust_balance_get: { agent_visible: false },
  trust_transactions_create: { agent_visible: false },
  calendar_entries_list: {
    params: { matter_id: "integer", from: "string", to: "string", query: "string", limit: "integer" },
    param_map: { from: "start_from", to: "start_to" }
  },
  expense_entries_list: {
    params: { matter_id: "integer", user_id: "integer", start_date: "string", end_date: "string", status: "string", type: "string", query: "string", limit: "integer" },
    param_map: { start_date: "date_from", end_date: "date_to" }
  },
  matters_create: {
    params: { body: objectBody },
    conformance_args: { body: { data: { client: { id: 1 }, description: "Conformance matter", display_number: "CONF-001", practice_area: { id: 1 }, responsible_attorney: { id: 1 }, status: "open", open_date: "2026-08-12" } } },
    request_map: {
      "body.data.client.id": "client_id", "body.data.description": ["display_name", "description"],
      "body.data.display_number": "number", "body.data.practice_area.id": "practice_area_id",
      "body.data.responsible_attorney.id": "responsible_attorney_id", "body.data.status": "status",
      "body.data.open_date": "open_date", "body.data.close_date": "close_date"
    }
  },
  matters_update: {
    params: { id: "integer", body: objectBody },
    conformance_args: { id: 1, body: { data: { description: "Conformance update" } } },
    request_map: {
      "body.data.description": ["display_name", "description"], "body.data.responsible_attorney.id": "responsible_attorney_id",
      "body.data.status": "status", "body.data.open_date": "open_date", "body.data.close_date": "close_date"
    }
  },
  contacts_create: {
    params: { body: objectBody },
    conformance_args: { body: { data: { type: "Company", name: "Conformance Client", email_addresses: [{ name: "Work", address: "conformance@example.com", default_email: true }], phone_numbers: [{ name: "Work", number: "555-0100", default_number: true }], title: "General Counsel" } } },
    request_map: {
      "body.data.type": "type", "body.data.name": "name", "body.data.email_addresses": "primary_email",
      "body.data.phone_numbers": "primary_phone", "body.data.title": "title", "body.data.company.id": "company_name"
    },
    request_transforms: { "body.data.email_addresses": "first_email", "body.data.phone_numbers": "first_phone" },
    request_defaults: { is_client: 0 }
  },
  contacts_update: {
    params: { id: "integer", body: objectBody },
    conformance_args: { id: 1, body: { data: { title: "Updated title" } } },
    request_map: {
      "body.data.type": "type", "body.data.name": "name", "body.data.email_addresses": "primary_email",
      "body.data.phone_numbers": "primary_phone", "body.data.title": "title", "body.data.company.id": "company_name"
    },
    request_transforms: { "body.data.email_addresses": "first_email", "body.data.phone_numbers": "first_phone" }
  },
  time_entries_create: {
    params: { body: objectBody },
    conformance_args: { body: { data: { type: "TimeEntry", date: "2026-08-12", matter: { id: 1 }, user: { id: 1 }, quantity: 1.5, price: 450, note: "Conformance time", activity_description: { utbms_task_id: 1 }, non_billable: false } } },
    request_map: {
      "body.data.matter.id": "matter_id", "body.data.user.id": "user_id", "body.data.date": "date",
      "body.data.quantity": "quantity_hours", "body.data.price": "rate", "body.data.note": "description",
      "body.data.activity_description.utbms_task_id": "utbms_task_code", "body.data.non_billable": "billable"
    },
    request_transforms: { "body.data.non_billable": "invert_bool" }
  },
  time_entries_update: {
    params: { id: "integer", body: objectBody },
    conformance_args: { id: 1, body: { data: { quantity: 1.25 } } },
    request_map: {
      "body.data.date": "date", "body.data.quantity": "quantity_hours", "body.data.price": "rate",
      "body.data.note": "description", "body.data.activity_description.utbms_task_id": "utbms_task_code",
      "body.data.non_billable": "billable"
    },
    request_transforms: { "body.data.non_billable": "invert_bool" }
  },
  expense_entries_create: {
    params: { body: objectBody },
    conformance_args: { body: { data: { type: "ExpenseEntry", date: "2026-08-12", matter: { id: 1 }, user: { id: 1 }, quantity: 1, price: 125, note: "Conformance expense", non_billable: false } } },
    request_map: {
      "body.data.matter.id": "matter_id", "body.data.user.id": "user_id", "body.data.date": "date",
      "body.data.price": "amount", "body.data.note": "description", "body.data.utbms_expense.id": "utbms_expense_code",
      "body.data.non_billable": "billable"
    },
    request_transforms: { "body.data.non_billable": "invert_bool" }
  },
  bills_update: {
    params: { id: "integer", body: objectBody },
    conformance_args: { id: 1, body: { data: { state: "awaiting_payment" } } },
    request_map: { "body.data.state": "state", "body.data.issued_at": "issue_date", "body.data.due_at": "due_date" }
  },
  calendar_entries_create: {
    params: { body: objectBody },
    conformance_args: { body: { data: { summary: "Conformance event", start_at: "2026-08-12T12:00:00Z", end_at: "2026-08-12T13:00:00Z", calendar_owner: { id: 1 }, matter: { id: 1 }, location: "Conference Room" } } },
    request_map: {
      "body.data.matter.id": "matter_id", "body.data.summary": "summary", "body.data.start_at": "start_at",
      "body.data.end_at": "end_at", "body.data.location": "location", "body.data.attendees": "attendee_user_ids"
    },
    request_transforms: { "body.data.attendees": "ids_csv" },
    request_defaults: { kind: "event" }
  },
  calendar_entries_update: {
    params: { id: "integer", body: objectBody },
    conformance_args: { id: 1, body: { data: { summary: "Updated event" } } },
    request_map: {
      "body.data.summary": "summary", "body.data.start_at": "start_at", "body.data.end_at": "end_at",
      "body.data.location": "location", "body.data.attendees": "attendee_user_ids"
    },
    request_transforms: { "body.data.attendees": "ids_csv" }
  },
  tasks_create: {
    params: { body: objectBody },
    conformance_args: { body: { data: { name: "Conformance task", description: "Conformance task description", assignee: { id: 1, type: "User" }, matter: { id: 1 }, due_at: "2026-08-20T12:00:00Z", priority: "Normal", status: "pending" } } },
    request_map: {
      "body.data.matter.id": "matter_id", "body.data.assignee.id": "assignee_user_id", "body.data.name": "name",
      "body.data.due_at": "due_at", "body.data.priority": "priority", "body.data.status": "status"
    }
  },
  tasks_update: {
    params: { id: "integer", body: objectBody },
    conformance_args: { id: 1, body: { data: { status: "complete" } } },
    request_map: {
      "body.data.assignee.id": "assignee_user_id", "body.data.due_at": "due_at",
      "body.data.priority": "priority", "body.data.status": "status"
    }
  },
  notes_create: {
    params: { body: objectBody },
    conformance_args: { body: { data: { contact: { id: 1 }, matter: { id: 1 }, type: "Matter", subject: "Conformance note", detail: "Conformance detail", date: "2026-08-12" } } },
    request_map: {
      "body.data.matter.id": "matter_id", "body.data.contact.id": "author_user_id",
      "body.data.subject": "subject", "body.data.detail": "detail"
    }
  },
  communications_create: {
    params: { body: objectBody },
    conformance_args: { body: { data: { type: "EmailCommunication", subject: "Conformance communication", body: "Conformance body", received_at: "2026-08-12T12:00:00Z", matter: { id: 1 }, senders: [{ id: 1, type: "Contact" }], receivers: [{ id: 2, type: "Contact" }] } } },
    request_map: {
      "body.data.matter.id": "matter_id", "body.data.type": "type", "body.data.subject": "subject",
      "body.data.body": "body", "body.data.senders": "senders", "body.data.receivers": "receivers",
      "body.data.received_at": "received_at"
    },
    request_transforms: { "body.data.senders": "ids_csv", "body.data.receivers": "ids_csv" }
  },
  notes_list: {
    params: { type: "string", matter_id: "integer", query: "string", limit: "integer" },
    conformance_args: { type: "Matter", limit: 10 },
    param_map: {}
  },
  tasks_list: {
    params: { matter_id: "integer", assignee_id: "integer", status: "string", priority: "string", query: "string", limit: "integer" },
    param_map: { assignee_id: "assignee_user_id" }
  },
  time_entries_list: {
    params: { matter_id: "integer", user_id: "integer", start_date: "string", end_date: "string", status: "string", type: "string", query: "string", limit: "integer" },
    param_map: { start_date: "date_from", end_date: "date_to" }
  },
  trust_transactions_list: {
    params: { matter_id: "integer", contact_id: "integer", kind: "string", status: "string", limit: "integer" },
    param_map: { contact_id: "client_id" }
  }
};

const rawMime = Buffer.from([
  "From: conformance@example.com", "To: recipient@example.com", "Subject: Conformance message",
  "Content-Type: text/plain; charset=utf-8", "", "Conformance body"
].join("\r\n")).toString("base64url");

const google = {
  sheets_values_get: {
    params: { spreadsheetId: "string", range: "string" },
    conformance_args: { spreadsheetId: "1", range: "Sheet1!A1" },
    param_map: { spreadsheetId: "spreadsheet_id" }
  },
  sheets_values_update: {
    params: { spreadsheetId: "string", range: "string", valueInputOption: "string", body: objectBody },
    conformance_args: { spreadsheetId: "1", range: "Sheet1!A1", valueInputOption: "RAW", body: { range: "Sheet1!A1", majorDimension: "ROWS", values: [["conformance"]] } },
    param_map: { spreadsheetId: "spreadsheet_id" },
    request_map: { "body.values": "value" },
    request_transforms: { "body.values": "first_cell" }
  },
  spreadsheets_list: {
    params: { q: "string", pageSize: "integer" },
    conformance_args: { q: "mimeType='application/vnd.google-apps.spreadsheet'", pageSize: 10 },
    param_map: { q: "query", pageSize: "limit" }
  },
  gmail_messages_list: {
    params: { userId: "string", q: "string", maxResults: "integer" },
    conformance_args: { userId: "me", q: "a", maxResults: 10 },
    param_map: { q: "query", maxResults: "limit" }
  },
  gmail_messages_get: {
    params: { userId: "string", id: "string" },
    conformance_args: { userId: "me", id: "1" }
  },
  gmail_messages_send: {
    params: { userId: "string", body: objectBody },
    conformance_args: { userId: "me", body: { raw: rawMime } },
    request_adapter: "gmail_raw",
    request_map: { "body.threadId": "thread_id" }
  },
  calendar_events_insert: {
    params: { calendarId: "string", sendUpdates: "string", body: objectBody },
    conformance_args: { calendarId: "primary", sendUpdates: "none", body: { summary: "Conformance event", start: { dateTime: "2026-08-12T12:00:00Z" }, end: { dateTime: "2026-08-12T13:00:00Z" }, attendees: [{ email: "conformance@example.com" }] } },
    param_map: { calendarId: "calendar" },
    request_map: {
      "body.summary": "summary", "body.start.dateTime": "start_at", "body.end.dateTime": "end_at",
      "body.attendees": "attendees"
    },
    request_transforms: { "body.attendees": "emails_csv" }
  }
};

const docusign = {
  esign_simulate_recipient_complete: { agent_visible: false },
  esign_envelopes_create: {
    params: { accountId: "string", body: objectBody },
    conformance_args: { accountId: "sim-account-001", body: { emailSubject: "Conformance envelope", status: "created", documents: [{ documentId: "1", name: "agreement.pdf", documentBase64: "Y29uZm9ybWFuY2U=" }], recipients: { signers: [{ name: "Signer", email: "signer@example.com", recipientId: "1", routingOrder: "1" }] } } },
    request_map: {
      "body.emailSubject": "emailSubject", "body.status": "status", "body.documents": "documentName",
      "body.recipients.signers": "recipients"
    },
    request_transforms: { "body.documents": "first_document_name", "body.recipients.signers": "json" }
  },
  esign_envelopes_send: {
    params: { accountId: "string", envelopeId: "string", body: objectBody },
    conformance_args: { accountId: "sim-account-001", envelopeId: "1", body: { status: "sent" } },
    request_map: { "body.status": "status" }
  }
};

const ledes = {
  invoices_list: { agent_visible: false },
  invoices_get: { agent_visible: false },
  invoice_lines_list: { agent_visible: false },
  invoice_total_check: { agent_visible: false },
  appeals_list: { agent_visible: false },
  appeals_create: { agent_visible: false }
};

const imanage = {
  documents_get: {
    params: { body: objectBody },
    conformance_args: { body: { documentId: "LEGAL!1.1", latest: true } },
    request_map: { "body.documentId": "id" },
    request_transforms: { "body.documentId": "imanage_document_id" }
  },
  documents_download: {
    params: { body: objectBody },
    conformance_args: { body: { documentId: "LEGAL!1.1", latest: true } },
    request_map: { "body.documentId": "id" },
    request_transforms: { "body.documentId": "imanage_document_id" }
  },
  documents_checkin: {
    params: { updateOrCreate: "string", documentId: "string", file: "string" },
    conformance_args: { updateOrCreate: "Create New Version", documentId: "LEGAL!1.1", file: "Conformance document version" },
    param_map: { documentId: "id", file: "body" },
    request_map: { documentId: "id" },
    request_transforms: { documentId: "imanage_document_id" },
    request_defaults: { checked_out_by: "", latest_version: 2, edit_date: "2026-08-12T12:00:00Z" }
  },
  documents_create: {
    params: { libraryId: "string", folderId: "string", inherit_profile_from_folder: "boolean", file: "string", author: "string", class: "string" },
    conformance_args: { libraryId: "LEGAL", folderId: "1", inherit_profile_from_folder: true, file: "Conformance document body", author: "Conformance Author", class: "DOCUMENT" },
    param_map: { folderId: "folder_id", file: "body", author: "author", class: "doc_class" },
    request_defaults: { workspace_id: 1, name: "Conformance document", doc_class: "DOCUMENT" }
  },
  workspaces_search: {
    params: { body: objectBody },
    conformance_args: { body: { libraryId: "LEGAL", anywhere: "a" } },
    request_map: { "body.anywhere": "query" }
  },
  folders_list: {
    params: { body: objectBody },
    conformance_args: { body: { libraryId: "LEGAL", container_id: "LEGAL!1" } },
    request_map: { "body.container_id": "workspace_id" },
    request_transforms: { "body.container_id": "imanage_container_id" }
  }
};

function apply(pathname, patches) {
  const before = fs.readFileSync(pathname, "utf8");
  const document = JSON.parse(before);
  const byName = new Map(document.tools.map((tool) => [tool.name, tool]));
  for (const [name, values] of Object.entries(patches)) {
    const tool = byName.get(name);
    if (!tool) throw new Error(`${path.basename(pathname)} missing ${name}`);
    for (const key of ["params", "conformance_args", "param_map", "request_map", "request_transforms", "request_defaults", "request_adapter", "agent_visible"]) {
      if (key in values) tool[key] = values[key];
      else if (key.startsWith("request_") && key in tool) delete tool[key];
    }
  }
  return JSON.stringify(document, null, 1) + "\n";
}

const outputs = new Map([
  [path.join(CONTRACTS, "practice-management.json"), clio],
  [path.join(CONTRACTS, "workspace.json"), google],
  [path.join(CONTRACTS, "esign.json"), docusign],
  [path.join(CONTRACTS, "dms.json"), imanage],
  [path.join(CONTRACTS, "ebilling.json"), ledes]
].map(([pathname, patches]) => [pathname, apply(pathname, patches)]));

const check = process.argv.includes("--check");
let stale = false;
for (const [pathname, expected] of outputs) {
  if (fs.readFileSync(pathname, "utf8") !== expected) {
    stale = true;
    if (check) console.error(`stale ${path.relative(ROOT, pathname)}`);
    else fs.writeFileSync(pathname, expected);
  }
}
if (check && stale) process.exit(1);
console.log(`${outputs.size} contracts ${check ? "match" : "updated"}`);
