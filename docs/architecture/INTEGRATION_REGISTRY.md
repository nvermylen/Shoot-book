# INTEGRATION_REGISTRY
## Lens — External System Contracts

> **Purpose**: Per-integration spec — auth model, OAuth scope, sync direction, agent tool surface, error handling, and refresh strategy. The contract between Lens and every external system.
>
> **When to update**: When adding a new integration, when changing OAuth scope, when changing sync direction, when an integration's tools are extended.
>
> **Boundary**: External system contracts only. Internal data shape → `ERP_DATA_MODEL.md`. Encryption / token storage rules → `SECURITY.md`. Agent ownership of integration calls → `AGENT_ARCHITECTURE.md`.

---

## Sync Direction Legend

| Direction | Meaning |
|-----------|---------|
| ⬇ Inbound | External system → ERP (Lens reads / receives) |
| ⬆ Outbound | ERP → External system (Lens writes / sends) |
| ⬌ Bidirectional | Both directions, with reconciliation rules |

When state diverges across a bidirectional integration, **ERP wins** (see `AGENT_ARCHITECTURE.md` Rule #1).

---

## Integration Index

| Service | Phase | Direction | Primary agent(s) | Adapter path |
|---------|-------|-----------|------------------|--------------|
| Gmail | 1 | ⬌ | LeadAgent, CommsAgent | `src/lib/integrations/gmail/` |
| Google Calendar | 1 | ⬌ | BookingAgent | `src/lib/integrations/calendar/` |
| Stripe | 2 | ⬌ | BillingAgent | `src/lib/integrations/stripe/` |
| QuickBooks | 3 | ⬆ | BillingAgent, ExpenseAgent | `src/lib/integrations/quickbooks/` |
| Cloud Storage | 3 | ⬆ | DeliveryAgent | `src/lib/integrations/storage/` |

---

## Gmail

**Phase:** 1 (first integration to ship)
**Direction:** ⬌ Bidirectional
**Primary agents:** LeadAgent (inbound), CommsAgent (outbound + thread reads)

> **Ship status (LENS-022d):** partially shipped. The `gmail.send` slice is
> live (`src/lib/integrations/gmail/client.ts`) for the BillingAgent payment
> chase — minimal input `{to, subject, body_html, body_text}`; `cc`,
> `in_reply_to`, and `attachments` land with the first CommsAgent flow.
> Inbound (Pub/Sub), `gmail.read_thread`, `gmail.search`, and labels are
> pending the Gmail lead-intake ticket. Tool permission is `billing`-only
> until the other consumer agents ship (least privilege; the table below is
> the target contract). Consent is one combined Google grant with Calendar —
> see LENS-D-025: granted scopes are verified from the token response, and a
> credential row never claims a scope its token lacks.

### Auth
- **Method:** OAuth 2.0
- **Scopes:** `gmail.readonly`, `gmail.send`, `gmail.modify` (for label management). Shipped so far: `gmail.send` only, requested in one combined consent with the Calendar read scope (LENS-D-025).
- **Token storage:** `integration_credentials` table, encrypted (see `SECURITY.md`)
- **Refresh:** adapter handles automatically; refresh window = 5 min before expiry

### Tool surface (`gmail.*`)
| Tool | Input | Output | Allowed agents |
|------|-------|--------|----------------|
| `gmail.send` | `{to, cc?, subject, body_html, body_text, in_reply_to?, attachments?}` | `{message_id, thread_id}` | LeadAgent, CommsAgent, BillingAgent, DeliveryAgent |
| `gmail.read_thread` | `{thread_id}` | `{messages: [...]}` | LeadAgent, CommsAgent, ExpenseAgent |
| `gmail.search` | `{query, max_results}` | `{threads: [...]}` | LeadAgent, ExpenseAgent |
| `gmail.add_label` | `{message_id, label_name}` | `{ok}` | CommsAgent |

### Sync rules
- **Inbound:** Gmail Push notifications via Pub/Sub → webhook → adapter parses → emits domain event (`gmail.message_received`).
- **Outbound:** Every `gmail.send` writes a `comm_log` row before the API call. If the API call fails, the row is marked `status='failed'` (no retries from app code — agent handles).
- **Threading:** `comm_log.external_message_id` stores Gmail's `message_id`. Thread IDs are stored on the matching `client` or `lead` row to link conversations.

### Error handling
- 429 (rate limit) → exponential backoff in adapter, max 3 retries.
- 401 / token revoked → agent receives `IntegrationAuthError`; agent escalates to photographer via `lens.escalate_to_owner`.
- Send to invalid address → `comm_log.status='bounced'`, agent retries with parent email if `client.parent_email` is set.

---

## Google Calendar

**Phase:** 1
**Direction:** ⬌ Bidirectional
**Primary agent:** BookingAgent

### Auth
- **Method:** OAuth 2.0 (same Google identity as Gmail — single consent)
- **Scopes:** `calendar.events` (read + write on photographer's primary calendar)
- **Token storage:** Same `integration_credentials` row when Google identity matches.

### Tool surface (`calendar.*`)
| Tool | Input | Output | Allowed agents |
|------|-------|--------|----------------|
| `calendar.check_availability` | `{start, end, duration_minutes}` | `{available: bool, conflicts: [...]}` | BookingAgent |
| `calendar.create_event` | `{title, start, end, description, attendees?}` | `{event_id, html_link}` | BookingAgent |
| `calendar.update_event` | `{event_id, patch}` | `{event_id}` | BookingAgent |
| `calendar.cancel_event` | `{event_id}` | `{ok}` | BookingAgent |

### Sync rules
- **Outbound:** every `booking.confirmed` triggers `calendar.create_event`. The returned `event_id` is stored on `booking.external_calendar_event_id`.
- **Inbound:** webhook on calendar changes. If photographer manually moves an event, BookingAgent observes the diff and either updates the booking (with notification) or escalates if the change conflicts with a confirmed deposit.

### Availability windows
Photographer-defined availability rules (per session type) live in the ERP table `availability_windows`. The calendar is consulted for *conflicts*, not for availability rules. This separation is deliberate — Morgan opens senior dates differently than family dates, and that's session-type logic, not calendar logic.

---

## Stripe

**Phase:** 2
**Direction:** ⬌ Bidirectional
**Primary agent:** BillingAgent

### Auth
- **Method:** Stripe Connect (Standard account) — photographer connects their own Stripe account.
- **Token storage:** `integration_credentials.access_token` = Stripe `account_id`.

### Tool surface (`stripe.*`)
| Tool | Input | Output | Allowed agents |
|------|-------|--------|----------------|
| `stripe.create_payment_link` | `{invoice_id, amount_cents, description, recipient_email}` | `{payment_link_url, payment_intent_id}` | BillingAgent |
| `stripe.check_payment_status` | `{payment_intent_id}` | `{status, amount_paid_cents, paid_at?}` | BillingAgent |
| `stripe.refund` | `{charge_id, amount_cents?, reason}` | `{refund_id}` | BillingAgent (with photographer approval) |

### Sync rules
- **Outbound:** invoice creation in ERP → `stripe.create_payment_link` → URL stored on `invoice.stripe_payment_link_url`.
- **Inbound:** Stripe webhook `payment_intent.succeeded` → adapter validates signature → emits `payment.received` domain event → BillingAgent reconciles to `invoice` and writes `payment` row, marks invoice `paid`.

### Reconciliation
- ERP is source of truth. If Stripe says paid and ERP doesn't (e.g., webhook missed), BillingAgent's reconciliation pass (runs hourly) reconciles via `stripe.check_payment_status` for invoices in `sent` or `partial` status.
- Refunds always originate in Lens, never in Stripe directly. Stripe-originated refunds trigger an escalation, not an automatic ERP write.

### Error handling
- Webhook signature invalid → reject with 401, log security event.
- Duplicate webhook delivery (Stripe at-least-once) → idempotent on `payment_intent_id`.

---

## QuickBooks

**Phase:** 3
**Direction:** ⬆ Outbound only (Lens is source of truth; QuickBooks is the export destination)
**Primary agents:** BillingAgent (invoices, payments), ExpenseAgent (expenses)

### Auth
- **Method:** OAuth 2.0 (Intuit Developer)
- **Scopes:** `com.intuit.quickbooks.accounting`
- **Token storage:** `integration_credentials`, encrypted.

### Tool surface (`quickbooks.*`)
| Tool | Input | Output | Allowed agents |
|------|-------|--------|----------------|
| `quickbooks.export_invoice` | `{invoice_id}` | `{quickbooks_invoice_id}` | BillingAgent |
| `quickbooks.export_payment` | `{payment_id}` | `{quickbooks_payment_id}` | BillingAgent |
| `quickbooks.export_expense` | `{expense_id}` | `{quickbooks_expense_id}` | ExpenseAgent |
| `quickbooks.lookup_customer` | `{client_id}` | `{quickbooks_customer_id?}` | BillingAgent |

### Sync rules
- **Outbound only.** Lens never reads QuickBooks state for reconciliation. QuickBooks is a downstream report destination.
- Customer records are upserted by `client.email` on first export.
- Invoices and expenses store the resulting QuickBooks ID on the source ERP row (e.g., `invoice.quickbooks_invoice_id`). Re-export updates the existing record.

### Error handling
- 401 / token expired → adapter refreshes; if refresh fails, agent escalates.
- 400 / invalid data → log + escalate. No automatic retry on validation errors.

---

## Cloud Storage

**Phase:** 3
**Direction:** ⬆ Outbound primarily (with metadata reads)
**Primary agent:** DeliveryAgent

### Auth
- **Method:** Provider-dependent. Initial provider TBD (see `DECISIONS_LOG.md` once chosen — likely R2 or S3 for v1, photographer-credentialed Google Drive for premium tier later).
- **Token storage:** `integration_credentials`.

### Tool surface (`storage.*`)
| Tool | Input | Output | Allowed agents |
|------|-------|--------|----------------|
| `storage.upload` | `{file_stream, path, metadata?}` | `{storage_path, public_url?}` | DeliveryAgent |
| `storage.create_signed_url` | `{storage_path, expires_in_seconds}` | `{url}` | DeliveryAgent |
| `storage.get_metadata` | `{storage_path}` | `{size, content_type, last_modified}` | DeliveryAgent |

### Sync rules
- **Outbound:** uploads write to `deliverable.storage_path` immediately. Public/signed URL written to `deliverable.external_url`.
- Download tracking is via signed-URL log entries → `deliverable.last_downloaded_at`.

---

## Adding a New Integration

Process (must complete all steps before merge):

1. **Update this file.** Add a new section with auth, scopes, tools, sync rules, error handling.
2. **Update `AGENT_ARCHITECTURE.md`** if the integration introduces new tool namespaces.
3. **Update `SECURITY.md`** with token storage and scope handling.
4. **Add a `DECISIONS_LOG.md` entry** explaining why this integration over alternatives.
5. **Create the adapter** at `src/lib/integrations/[serviceName]/` matching the standard structure.
6. **Register tools in the gateway tool registry** with input/output Zod schemas.
7. **Wire agent permissions** in each consuming agent's `tools.ts`.
8. **Write integration tests** (mocked external API) and a local-dev seed script.

---

## Cross-References

| Concern | Lives in |
|---------|----------|
| Architecture (gateway, agent tool boundaries) | `AGENT_ARCHITECTURE.md` |
| Entity columns that store external IDs (`*.quickbooks_*_id`, `external_calendar_event_id`) | `ERP_DATA_MODEL.md` |
| Encryption, token storage, scope review | `SECURITY.md` |
| Anti-patterns (e.g., importing SDK outside adapter) | `ANTI_PATTERNS.md` |

---

*Lens | Integration Registry | Last updated: [DATE]*
