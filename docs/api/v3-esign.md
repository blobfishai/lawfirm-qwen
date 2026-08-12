# SealPoint eSign (SIMULATED) — API surface mirrors Docusign eSignature REST API v2.1

**Dialect:** `docusign` · **Provenance:** https://github.com/docusign/OpenAPI-Specifications/blob/master/esignature.rest.swagger-v2.1.json

**Response envelopes** (what every tool of this product returns):

| Op | Envelope |
|---|---|
| list/search | `{"signers": [{"recipientId", "routingOrder", "status"}]}` |
| get | `{"envelopeId", "status", "statusDateTime"}` |
| create/update | `{"envelopeId", "status"}` |

**Tables (SQLite):** `es_envelopes`, `es_recipients`, `es_events`

## `esign_envelopes_create`

*Mirrors:* POST /v2.1/accounts/{accountId}/envelopes — Envelopes_PostEnvelopes

Create a draft or sent eSignature envelope with ordered signers.

**Who uses it & why:** 

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `accountId` | string | yes | same |
| `body` | object | no | same |

**Op:** `docusign_create` on `es_envelopes`

## `esign_envelopes_get`

*Mirrors:* GET /v2.1/accounts/{accountId}/envelopes/{envelopeId} — Envelopes_GetEnvelope

Get envelope status. In the simulator, polling deterministically admits external delivery/signing events in routing order.

**Who uses it & why:** 

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `accountId` | string | yes | same |
| `envelopeId` | string | yes | same |

**Op:** `docusign_get` on `es_envelopes`

## `esign_envelopes_send`

*Mirrors:* PUT /v2.1/accounts/{accountId}/envelopes/{envelopeId} — Envelopes_PutEnvelope

Send a draft by updating its status to sent.

**Who uses it & why:** 

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `accountId` | string | yes | same |
| `envelopeId` | string | yes | same |
| `body` | object | no | same |

**Op:** `docusign_update` on `es_envelopes`

## `esign_recipients_list`

*Mirrors:* GET /v2.1/accounts/{accountId}/envelopes/{envelopeId}/recipients — Recipients_GetRecipients

List envelope recipients, routing order, and lifecycle status.

**Who uses it & why:** 

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `accountId` | string | yes | same |
| `envelopeId` | string | yes | same |

**Op:** `docusign_recipients` on `es_recipients`

## Internal simulator boundary

These operations are not published by MCP `tools/list` and cannot be called by an evaluated agent. They actuate deterministic external state or preserve migration-only storage behavior:

- `esign_simulate_recipient_complete`

