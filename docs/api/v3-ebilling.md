# LedgerBill (SIMULATED) — API surface mirrors LEDES 1998B e-billing exchange

**Dialect:** `ledes` · **Provenance:** https://ledes.org/ (LEDES 1998B format; UTBMS task/activity/expense codes at utbms.com)

**Response envelopes** (what every tool of this product returns):

| Op | Envelope |
|---|---|
| list/search | `{"count": N, "lines"\|"invoices": [{"LINE_ITEM_TASK_CODE": ..., "LINE_ITEM_TOTAL": ...}]}` |
| get | `LEDES 1998B field-named object` |
| create/update | `LEDES 1998B field-named object` |

**Tables (SQLite):** `eb_utbms_codes`, `eb_invoices`, `eb_invoice_lines`, `eb_appeals`

## `utbms_codes_list`

*Mirrors:* UTBMS code sets (utbms.com)

List UTBMS task/activity/expense codes.

**Who uses it & why:** A new associate looks up the right L-code before entering time.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `kind` | string | no | same |
| `code` | string | no | same |
| `limit` | integer | no | same |

**Op:** `list` on `eb_utbms_codes`

## `invoices_list`

*Mirrors:* LEDES exchange: invoice inventory

List e-billing invoices by status/matter.

**Who uses it & why:** The e-billing coordinator lists rejected invoices to rework this week.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `status` | string | no | same |
| `matter_number` | string | no | same |
| `limit` | integer | no | same |

**Field re-keying (LEDES 1998B):** `id`→`INVOICE_ID`, `invoice_number`→`INVOICE_NUMBER`, `matter_number`→`LAW_FIRM_MATTER_ID`, `client_matter_id`→`CLIENT_MATTER_ID`, `billing_start`→`BILLING_START_DATE`, `billing_end`→`BILLING_END_DATE`…

**Op:** `list` on `eb_invoices`

## `invoices_get`

*Mirrors:* LEDES invoice detail

Fetch one invoice with validation state.

**Who uses it & why:** She opens one invoice to read the client's validation errors.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `id` | integer | no | same |

**Field re-keying (LEDES 1998B):** `id`→`INVOICE_ID`, `invoice_number`→`INVOICE_NUMBER`, `matter_number`→`LAW_FIRM_MATTER_ID`, `client_matter_id`→`CLIENT_MATTER_ID`, `billing_start`→`BILLING_START_DATE`, `billing_end`→`BILLING_END_DATE`…

**Op:** `get` on `eb_invoices`

## `invoice_lines_list`

*Mirrors:* LEDES 1998B line items

List an invoice's LEDES lines (timekeeper, codes, amounts).

**Who uses it & why:** The client reduced three lines; the coordinator finds them by task code.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `invoice_id` | integer | no | same |
| `task_code` | string | no | same |
| `timekeeper` | string | no | same |
| `limit` | integer | no | same |

**Field re-keying (LEDES 1998B):** `id`→`LINE_ITEM_NUMBER`, `invoice_id`→`INVOICE_ID`, `line_date`→`LINE_ITEM_DATE`, `timekeeper`→`TIMEKEEPER_NAME`, `task_code`→`LINE_ITEM_TASK_CODE`, `activity_code`→`LINE_ITEM_ACTIVITY_CODE`…

**Op:** `list` on `eb_invoice_lines`

## `invoices_submit`

*Mirrors:* submit LEDES file to client e-billing

Move an invoice to submitted (must be validated first).

**Who uses it & why:** After validation passes, she submits the LEDES file to the client's system.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `id` | integer | no | same |
| `status` | string | no | same |
| `submitted_at` | string | no | same |
| `validation_errors` | string | no | same |

**Field re-keying (LEDES 1998B):** `id`→`INVOICE_ID`, `invoice_number`→`INVOICE_NUMBER`, `matter_number`→`LAW_FIRM_MATTER_ID`, `client_matter_id`→`CLIENT_MATTER_ID`, `billing_start`→`BILLING_START_DATE`, `billing_end`→`BILLING_END_DATE`…

**Op:** `update` on `eb_invoices`

## `invoice_total_check`

*Mirrors:* derived: sum lines vs invoice total

Sum an invoice's line amounts (reconcile against header total).

**Who uses it & why:** Before submitting, she reconciles the line-item sum against the header total.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `invoice_id` | integer | no | same |

**Field re-keying (LEDES 1998B):** `id`→`LINE_ITEM_NUMBER`, `invoice_id`→`INVOICE_ID`, `line_date`→`LINE_ITEM_DATE`, `timekeeper`→`TIMEKEEPER_NAME`, `task_code`→`LINE_ITEM_TASK_CODE`, `activity_code`→`LINE_ITEM_ACTIVITY_CODE`…

**Op:** `aggregate` on `eb_invoice_lines`

## `appeals_list`

*Mirrors:* e-billing appeals

List billing appeals/reductions.

**Who uses it & why:** Month-end: the billing partner reviews open appeals and their status.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `invoice_id` | integer | no | same |
| `status` | string | no | same |
| `limit` | integer | no | same |

**Op:** `list` on `eb_appeals`

## `appeals_create`

*Mirrors:* file an appeal

Appeal a rejected/reduced line.

**Who uses it & why:** The firm appeals the 'block billing' reduction with the corrected narrative.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `invoice_id` | integer | yes | same |
| `line_id` | integer | yes | same |
| `reason` | string | yes | same |

**Op:** `create` on `eb_appeals`

