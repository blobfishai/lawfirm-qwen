# DeadlineRules (SIMULATED) — rule fixtures follow published FRCP sources

**Dialect:** `calendar_rules` · **Provenance:** https://www.uscourts.gov/forms-rules/current-rules-practice-procedure/federal-rules-civil-procedure

**Response envelopes** (what every tool of this product returns):

| Op | Envelope |
|---|---|
| list/search | `{"deadlines": [{"date", "rule_citation", "source_url"}]}` |
| get | `{"deadlines": [...] }` |
| create/update | `read-only computation surface` |

**Tables (SQLite):** `deadline_rules`

## `deadlines_compute`

*Mirrors:* CalendarRules-style trigger + jurisdiction deadline calculation; rules pinned to official FRCP text

Compute a verified federal civil deadline and return its rule citation. Unsupported jurisdictions and triggers fail explicitly.

**Who uses it & why:** 

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `trigger_event` | string | yes | same |
| `jurisdiction` | string | yes | same |
| `service_method` | string | yes | same |
| `trigger_date` | string | yes | same |

**Op:** `deadline_compute` on `deadline_rules`

