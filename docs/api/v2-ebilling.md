# LedgerBill (SIMULATED) — API surface mirrors LEDES 1998B e-billing exchange

Provenance: https://ledes.org/ (LEDES 1998B format; UTBMS task/activity/expense codes at utbms.com)

Tables: `eb_utbms_codes`, `eb_invoices`, `eb_invoice_lines`, `eb_appeals`

## `utbms_codes_list`

*Mirrors:* UTBMS code sets (utbms.com)

List UTBMS task/activity/expense codes.

**Who uses it & why:** A new associate looks up the right L-code before entering time.

**Params:** `kind:string, code:string, limit:integer` · **Op:** list on `eb_utbms_codes`

## `invoices_list`

*Mirrors:* LEDES exchange: invoice inventory

List e-billing invoices by status/matter.

**Who uses it & why:** The e-billing coordinator lists rejected invoices to rework this week.

**Params:** `status:string, matter_number:string, limit:integer` · **Op:** list on `eb_invoices`

## `invoices_get`

*Mirrors:* LEDES invoice detail

Fetch one invoice with validation state.

**Who uses it & why:** She opens one invoice to read the client's validation errors.

**Params:** `id:integer` · **Op:** get on `eb_invoices`

## `invoice_lines_list`

*Mirrors:* LEDES 1998B line items

List an invoice's LEDES lines (timekeeper, codes, amounts).

**Who uses it & why:** The client reduced three lines; the coordinator finds them by task code.

**Params:** `invoice_id:integer, task_code:string, timekeeper:string, limit:integer` · **Op:** list on `eb_invoice_lines`

## `invoices_submit`

*Mirrors:* submit LEDES file to client e-billing

Move an invoice to submitted (must be validated first).

**Who uses it & why:** After validation passes, she submits the LEDES file to the client's system.

**Params:** `id:integer, status:string, submitted_at:string, validation_errors:string` · **Op:** update on `eb_invoices`

## `invoice_total_check`

*Mirrors:* derived: sum lines vs invoice total

Sum an invoice's line amounts (reconcile against header total).

**Who uses it & why:** Before submitting, she reconciles the line-item sum against the header total.

**Params:** `invoice_id:integer` · **Op:** aggregate on `eb_invoice_lines`

## `appeals_list`

*Mirrors:* e-billing appeals

List billing appeals/reductions.

**Who uses it & why:** Month-end: the billing partner reviews open appeals and their status.

**Params:** `invoice_id:integer, status:string, limit:integer` · **Op:** list on `eb_appeals`

## `appeals_create`

*Mirrors:* file an appeal

Appeal a rejected/reduced line.

**Who uses it & why:** The firm appeals the 'block billing' reduction with the corrected narrative.

**Params:** `invoice_id:integer, line_id:integer, reason:string` · **Op:** create on `eb_appeals`
