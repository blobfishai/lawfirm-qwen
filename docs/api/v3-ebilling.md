# LedgerBill (SIMULATED) — API surface mirrors LEDES 1998B e-billing exchange

**Dialect:** `ledes` · **Provenance:** https://ledes.org/ledes-98b-format/ (LEDES 1998B: ASCII, pipe-delimited, 24 fields; UTBMS codes at utbms.com)

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

## `invoices_submit`

*Mirrors:* LEDES 1998B file serialization — https://ledes.org/ledes-98b-format/

Serialize one invoice as the exact 24-field ASCII, pipe-delimited LEDES 1998B exchange file and mark it submitted.

**Who uses it & why:** After validation passes, she submits the LEDES file to the client's system.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `id` | integer | yes | same |

**Op:** `ledes_submit` on `eb_invoices`

## Internal simulator boundary

These operations are not published by MCP `tools/list` and cannot be called by an evaluated agent. They actuate deterministic external state or preserve migration-only storage behavior:

- `invoices_list`
- `invoices_get`
- `invoice_lines_list`
- `invoice_total_check`
- `appeals_list`
- `appeals_create`

