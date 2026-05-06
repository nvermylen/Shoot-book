# DOMAIN GLOSSARY
## Lens

> **Purpose**: Precise terminology for photography-as-a-business and for the Lens system. When generic usage and Lens usage diverge, Lens usage wins. When code, UI, and conversation use different words for the same thing, this file disambiguates.
>
> **When to update**: A spec introduces a new term, a PR review reveals a term was interpreted differently than intended, or a domain concept is used inconsistently across files.

---

## Photography Business Terms

### Session
**Definition:** A scheduled photography appointment between a photographer and a client. The unit of value Lens is built around.
**Code representation:** `booking` table.
**Do not confuse with:** "Session" the auth term (logged-in browser session). When ambiguity is possible, write "photo session" or "booking."

### Senior Session
**Definition:** A portrait session for a high-school senior, typically booked by the student but paid for by a parent. The driving use case behind Lens's `parent_email` column.
**Notes:** Distinct from "senior portrait" generic — implies a specific client journey (subject ≠ payer).

### Family Session / Couples Session / Newborn Session
**Definition:** Variants of `booking.package.session_type`. Each has different availability rules, location options, and pricing tiers.

### Style Guide
**Definition:** Photographer-authored content sent to clients before a session covering wardrobe, hair, makeup, posing prep. Often delivered as a PDF link.
**Code representation:** Currently a link sent via email automation. Future: `style_guide_url` on `package` or per-photographer setting.

### Locations Gallery
**Definition:** A photographer's catalog of reusable shoot locations, organized by category, that clients select from before a session.
**Code representation:** `location` table (catalog) + `booking_location` (selections).
**Domain rule:** locations selected for one booking must share the same `category` (Morgan's pain point — clients otherwise pick incompatible mixes).

### Package
**Definition:** A configurable product sold by the photographer — bundles session type, deliverable count, included locations, and price.
**Code representation:** `package` table.

### Deposit
**Definition:** The non-refundable down payment that confirms a booking. Typically 25–50% of total package price.
**Code representation:** `invoice` row with `kind = 'deposit'`.

### Final Payment
**Definition:** The remaining balance, due before the session date.
**Code representation:** `invoice` row with `kind = 'final'`.
**Domain rule:** photographer's #1 pain — if not chased automatically, sessions arrive unpaid.

### Gallery
**Definition:** The collection of edited photographs delivered to the client after a session.
**Code representation:** `deliverable` row with `kind = 'gallery'`.

### Sneak Peek
**Definition:** A small set of edited images delivered shortly after the shoot, before the full gallery is ready. Manages client anticipation.
**Code representation:** `deliverable` row with `kind = 'sneak_peek'`.

### Add-on
**Definition:** An item purchased outside the package — extra prints, additional outfits, rush delivery.
**Code representation:** `invoice` row with `kind = 'addon'`.

---

## Lens System Terms

### Photographer
**Definition:** The Lens user. The business owner. One per Supabase auth account.
**Code representation:** `photographer` table; `photographer_id` is the partition key for nearly every other table.
**Do not confuse with:** "user" — Lens has only photographer users. When code says `user_id`, it means `photographer_id`.

### Client
**Definition:** The person the photographer is photographing or who books on behalf of the subject. May be the same as the subject (family session) or different (senior session — teen subject, parent client).
**Code representation:** `client` table.

### Lead
**Definition:** A potential client who has expressed interest but has not yet booked or been qualified.
**Code representation:** `lead` table.
**Lifecycle:** `new` → `qualified` | `disqualified` → if qualified, `converted` to a client (with `converted_client_id` set).

### Booking
**Definition:** A confirmed photo session in the photographer's calendar. The aggregate root for everything related to that session.
**Code representation:** `booking` table. References `client`, `package`, `contract`, `invoices`, `locations`, `deliverables`, `comm_log`.
**Do not confuse with:** "Reservation" or "Appointment" — those terms aren't used in Lens.

### Booking Status
**Values:** `tentative` | `confirmed` | `completed` | `cancelled`.
**Transitions:**
- `tentative` → `confirmed` (on contract signed + deposit paid)
- `confirmed` → `completed` (on session date passing without cancellation)
- `confirmed` | `tentative` → `cancelled` (explicit cancel)

### Comm / Comm Log
**Definition:** Any communication — sent or received, automated or manual, email or SMS or in-app. The append-only ledger of "what was said to this client and when."
**Code representation:** `comm_log` table.
**Domain rule:** the comm log is append-only. Corrections happen by adding a new row, not editing an old one.

### Sequence (Comm Sequence)
**Definition:** A series of templated messages tied to a trigger (booking created, session approaching, payment overdue). Defines what gets sent when, automatically.
**Code representation:** `comm_sequence` (template) + `comm_sequence_state` (per-client progression).

---

## Agent-on-ERP Terms

### Agent
**Definition:** A specialized LLM-powered process that owns a vertical slice of the photography business and acts via tools. Lens has six agents: Lead, Booking, Comms, Billing, Expense, Delivery.
**Code representation:** `src/lib/ai/agents/[agent]/`.
**Do not confuse with:** generic "AI" or "the chatbot" — Lens does not have a singular AI; it has six specialized agents.

### Gateway
**Definition:** The single point through which all LLM calls flow. Provides retry, model selection, prompt versioning, eval mode, tool routing, structured logging.
**Code representation:** `src/lib/ai/gateway.ts`.
**Domain rule:** the gateway is the only file allowed to import the LLM SDK.

### Tool
**Definition:** A typed function an agent can call to act on the world. Two namespaces: `lens.*` (ERP writes) and `[service].*` (integrations).
**Code representation:** `src/lib/ai/tools/registry.ts` (registry) + `src/lib/ai/agents/[agent]/tools.ts` (per-agent allow-list).

### Prompt Version
**Definition:** A frozen version of an agent's system prompt. Active version set in code; older versions retained for fixture replay.
**Code representation:** `src/lib/ai/agents/[agent]/prompts/system.v[N].ts`.

### Eval
**Definition:** A reproducible test of agent behavior on a fixed input. Three categories: regression, new-capability, adversarial.
**Code representation:** `src/lib/ai/evals/[agent]/`.

### ERP
**Definition:** The deterministic, auditable data layer that holds the canonical state of the business. The "source of truth" the entire system orbits.
**Code representation:** `src/lib/erp/[entity]/` for business logic; database tables for storage.

### Integration / Adapter
**Definition:** A bidirectional connection to an external system (Gmail, Stripe, etc.). The adapter is the code; the integration is the connection.
**Code representation:** `src/lib/integrations/[service]/`.
**Domain rule:** the adapter is the only code allowed to import the external SDK.

### Domain Event
**Definition:** A typed message published when something significant happens in the system (e.g., `booking.created`, `payment.received`). Used for ERP-mediated and event-driven cross-agent coordination.
**Code representation:** `src/lib/events/`.

### Source of Truth
**Definition:** When state appears in multiple places (ERP, Stripe, QuickBooks), the ERP is canonical. Reconciliation flows toward the ERP.

### Replace vs Integrate
**Definition:** The classification framework for every external software product:
- **Replace** — vertical photo SaaS Lens competes with (HoneyBook, Pixieset, Session, Studio Ninja, Iris Works, Dubsado, Sprout, Tave).
- **Integrate** — horizontal infrastructure photographers already use (Gmail, QuickBooks, Stripe, Calendar, Storage).

---

## Status Values (Authoritative)

| Entity | Column | Values | Terminal? |
|--------|--------|--------|-----------|
| `lead` | `qualification_status` | `new`, `qualified`, `disqualified`, `converted` | `disqualified`, `converted` |
| `booking` | `status` | `tentative`, `confirmed`, `completed`, `cancelled` | `completed`, `cancelled` |
| `invoice` | `status` | `draft`, `sent`, `paid`, `partial`, `overdue`, `cancelled` | `paid`, `cancelled` |
| `comm_sequence_state` | `status` | `active`, `paused`, `completed`, `cancelled` | `completed`, `cancelled` |
| `contract` | `signed_at` | nullable timestamp (presence = signed) | — |

---

## Naming Conventions in Code

| Concept | Canonical | ❌ Do Not Use |
|---------|-----------|---------------|
| Photographer | `photographer_id`, `photographer` | `user_id`, `userId`, `owner_id` |
| Client | `client_id`, `client` | `customer_id`, `customer` |
| Booking | `booking_id`, `booking` | `session_id`, `appointment_id`, `reservation` |
| Lead | `lead_id`, `lead` | `inquiry`, `prospect` |
| Package | `package_id`, `package` | `product`, `offering`, `tier` |
| Status field | `status` | `state`, `phase`, `stage` |
| Soft delete | `deleted_at` | `is_deleted`, `archived_at` |

---

## User-Facing vs Code Terms

| UI Label | Code | Notes |
|----------|------|-------|
| "Session" | `booking` | UI says session, code says booking. Always. |
| "Inquiry" / "Lead" | `lead` | Both UI labels acceptable — `lead` is the canonical code term. |
| "Style Guide" | (link on package or photographer settings) | No table column yet — Phase 1 ships as a link in comms templates. |
| "Day of" view | the bookings filtered to today's date | No code term — it's a filter+sort applied to bookings. |

---

## Terms to Avoid

| Avoid | Use Instead | Reason |
|-------|-------------|--------|
| `data` (variable name) | specific noun (`bookings`, `leadList`) | Too vague |
| `item` / `thing` | specific noun | Same |
| `appointment` | `booking` | Inconsistent with system terminology |
| `customer` | `client` | Inconsistent with system terminology |
| `transaction` | `payment` or `invoice` | Ambiguous — be specific |
| `reservation` | `booking` | Wrong domain (hospitality, not photography) |
| `event` (for booking) | `booking` or "session" (UI) | Reserve "event" for domain events |
| `meeting` | `booking` | Wrong domain |

---

## Abbreviations

| Abbr | Full | Context |
|------|------|---------|
| PII | Personally Identifiable Information | `SECURITY.md` |
| RLS | Row-Level Security | Supabase / `docs/personas/PERSONA_ARCH.md` |
| ZDR | Zero Data Retention | LLM gateway logging policy |
| ERP | Enterprise Resource Planning | The Lens canonical data layer |
| AC | Acceptance Criteria | Feature Specs |
| CC | Claude Code | The agent doing the implementation work |

---

*Lens | Domain Glossary | Last updated: [DATE]*
