# AGENT_ARCHITECTURE
## Lens — The System That Runs Photography Businesses

> **Purpose**: The thinking layer for everything agent-related in Lens. The *why* and *how* of the agent-on-ERP architecture. When an architectural question comes up — where does this code live, which agent owns this, why is the gateway necessary — the answer is here.
>
> **When to update**: When a new agent is added, when an agent boundary shifts, when the gateway pattern is extended, when a multi-agent coordination pattern is established. Architecture changes that don't update this file are how the codebase rots.

---

## Core Thesis

Lens is not "AI sprinkled on a CRUD app." It is an **agent-on-ERP system**: a deterministic, photography-specific data model wrapped by specialized AI agents that operate the business. Every architectural decision earns this thesis or gets cut.

The system has three layers, in this order:

```
┌─────────────────────────────────────────────────────────────┐
│  Integration Layer                                          │
│  Gmail │ QuickBooks │ Stripe │ Calendar │ Storage           │
│  Adapters expose tools to agents.                           │
│  Webhooks emit domain events. ERP is the destination.       │
├─────────────────────────────────────────────────────────────┤
│  Agent Layer                                                │
│  Lead │ Booking │ Comms │ Billing │ Expense │ Delivery      │
│  Every LLM call flows through one gateway.                  │
│  Versioned prompts + per-agent evals.                       │
├─────────────────────────────────────────────────────────────┤
│  ERP Layer (Source of Truth)                                │
│  Photographers, clients, leads, bookings, contracts, …      │
│  Deterministic. Auditable. Versioned writes. RLS.           │
└─────────────────────────────────────────────────────────────┘
```

Three rules govern how the layers interact:

1. **ERP is source of truth.** When state conflicts (Stripe says paid, ERP says unpaid, QuickBooks says half-paid), the ERP wins. Reconciliation flows toward the ERP.
2. **Agents are the only path to writes that should go through an agent.** Application code (API routes, server components) calls agents for anything an agent owns. It does not bypass to write directly.
3. **Integrations are side effects.** External systems hold derived state. They are downstream of the ERP, not parallel to it.

---

## The Six Agents

Every agent owns a vertical slice of the photography business. Boundaries are enforced by code review and by `ANTI_PATTERNS.md` rule #25 (cross-agent direct calls).

### LeadAgent
- **Owns:** lead intake, qualification, conversion to client.
- **Reads:** `leads`, `packages`, `comm_log`.
- **Writes:** `leads`, `clients` (on conversion), `comm_log`.
- **Tools:** `gmail.read_thread`, `gmail.send`, `lens.create_lead`, `lens.qualify_lead`, `lens.convert_lead_to_client`.

### BookingAgent
- **Owns:** session booking — package selection, date/time, location, contract, deposit trigger.
- **Reads:** `clients`, `packages`, `locations`, `bookings`, `availability_windows`.
- **Writes:** `bookings`, `contracts`, `booking_locations`.
- **Tools:** `lens.create_booking`, `calendar.check_availability`, `calendar.create_event`, `lens.assign_locations`, `lens.send_contract`, `lens.trigger_deposit_invoice`.

### CommsAgent
- **Owns:** all client communication — automated sequences, ad-hoc replies, escalations to the photographer.
- **Reads:** `clients`, `bookings`, `comm_log`, `comm_sequences`.
- **Writes:** `comm_log`, `comm_sequence_state`.
- **Tools:** `gmail.send`, `gmail.read_thread`, `lens.log_comm`, `lens.escalate_to_owner`, `lens.advance_sequence`.

### BillingAgent
- **Owns:** invoicing, payment chasing, reconciliation between Stripe / QuickBooks / ERP.
- **Reads:** `bookings`, `contracts`, `invoices`, `payments`.
- **Writes:** `invoices`, `payments` (on reconciliation).
- **Tools:** `lens.create_invoice`, `stripe.create_payment_link`, `stripe.check_payment_status`, `lens.record_payment`, `gmail.send`, `lens.escalate_to_owner`.

### ExpenseAgent
- **Owns:** business expense capture, categorization, export to accounting.
- **Reads:** `expenses`.
- **Writes:** `expenses`.
- **Tools:** `gmail.read_thread` (receipt parsing), `lens.create_expense`, `lens.categorize_expense`, `quickbooks.export_expenses`.

### DeliveryAgent
- **Owns:** gallery delivery, download tracking, post-session follow-up.
- **Reads:** `bookings`, `deliverables`, `comm_log`.
- **Writes:** `deliverables`, `comm_log`.
- **Tools:** `storage.upload`, `lens.create_gallery_link`, `gmail.send`, `lens.mark_delivered`.

---

## The Gateway Pattern

All LLM calls — without exception — flow through `src/lib/ai/gateway.ts`.

What the gateway provides:
- A single retry / exponential-backoff policy for all LLM traffic.
- Structured logging: token counts, latency, agent ID, prompt version, tool calls. **Never** prompt content (ZDR posture, see `SECURITY.md`).
- Model selection per agent (e.g., Haiku for classification, Sonnet for generation).
- Eval mode toggle — replay against fixtures or hit live API.
- Prompt version resolution — gateway loads from `getActiveVersion(agentId)`.
- Tool call routing — gateway dispatches to integration adapters or ERP write functions.

**Anti-pattern:** `import Anthropic from '@anthropic-ai/sdk'` anywhere outside `gateway.ts`. Enforced by `ANTI_PATTERNS.md`.

**Why:** without a single gateway, prompt versions drift, retry logic gets duplicated across agents, and evaluating an agent in isolation becomes impossible because every agent has its own LLM client wired differently.

---

## Prompt Versioning

Every agent has a frozen, versioned prompt set. Prompts live at:

```
src/lib/ai/agents/[agentName]/prompts/
├── system.v1.ts
├── system.v2.ts
├── tools.v1.ts
└── index.ts                ← exports getActiveVersion(agentId)
```

Rules:

1. **Never edit a published version.** Bump the version number. The old version stays for fixture replay.
2. **Active version is set in code, not config.** No env var toggles for prompt versions in production. The active version is part of the deployed artifact.
3. **Promotion gate.** A new version cannot become active until the per-agent eval suite passes against it. See `EVAL_HARNESS.md` (deferred — created when first agent ships).
4. **Prompts are typed constants, not strings.** Defined as `as const` exports for type safety.

---

## Per-Agent Evals

Every agent ships with an eval suite under `src/lib/ai/evals/[agentName]/`. Evals are categorized:

| Type | Purpose | Run cadence |
|------|---------|-------------|
| **Regression** | Prevent prompt changes from breaking known behavior | On every prompt version bump |
| **New-capability** | Validate a new capability actually works end-to-end | When the capability is added |
| **Adversarial** | Validate the agent handles bad/manipulative input | On every prompt version bump |

**Key principle:** If the agent doesn't have evals, the agent isn't done.

The eval harness itself is documented in `EVAL_HARNESS.md` once the first agent ships and the patterns stabilize.

---

## Multi-Agent Coordination

Agents do NOT call each other directly. Cross-agent coordination happens through one of three patterns, in this preference order:

### 1. ERP-mediated (default — prefer this)
Agent A writes to the ERP. Agent B observes new state and acts.
*Example:* BookingAgent creates a `booking` row. BillingAgent picks up `bookings WHERE deposit_invoice_id IS NULL` and creates the deposit invoice.

### 2. Event-driven
Agent A emits a domain event via the event bus (`src/lib/events/`). Agent B subscribes.
*Example:* `booking.created` event → CommsAgent sends the confirmation email sequence.

### 3. Orchestrator-coordinated (rare — escalate before using)
A non-agent orchestrator sequences multiple agents for a single user-facing operation.
*Example:* a "book this session" API endpoint orchestrates Lead→Client conversion, then BookingAgent, then BillingAgent for the deposit.

**Anti-pattern:** Agent A imports Agent B and calls a function on it directly. Coupling agents this way makes eval-in-isolation impossible and turns the agent layer back into a tangled service mesh.

---

## Integration Layer

Each external integration has an adapter at `src/lib/integrations/[serviceName]/`:

```
src/lib/integrations/gmail/
├── client.ts        ← OAuth client + token refresh
├── tools.ts         ← Tool definitions exposed to agents
├── webhooks.ts      ← Webhook signature verification + event dispatch
└── sync.ts          ← Inbound sync (external state → ERP)
```

Rules:

1. **Adapters are the only code allowed to import the external SDK.** Agents call the adapter's exported tools — they never `import { google } from 'googleapis'` directly.
2. **All adapter writes that affect ERP state pass through an agent.** Webhooks dispatch a domain event; the relevant agent handles it.
3. **OAuth tokens are stored encrypted in `integration_credentials`.** Refresh logic lives in the adapter, never in an agent.

Per-integration specifics: `INTEGRATION_REGISTRY.md`.

---

## Tool Boundaries

Tools are how agents act on the world. Two namespaces:

- **ERP tools** (`lens.*`) — write to the canonical data model.
- **Integration tools** (`gmail.*`, `stripe.*`, `calendar.*`, `storage.*`, `quickbooks.*`) — call external systems.

Rules:

1. Every tool has a typed input schema (Zod) and a typed output schema.
2. Every tool is registered in the gateway's tool registry. No ad-hoc tools.
3. **Tool permissions are agent-scoped.** BookingAgent cannot call `quickbooks.*` tools. Each agent's `tools.ts` declares its allowed tool set; the gateway enforces.
4. Every tool call is logged: `agent_id, tool_name, input_hash, output_hash, timestamp, status`. Logged to the `agent_tool_call_log` table.

---

## What Lives Where

| Concern | Location |
|---------|----------|
| Gateway | `src/lib/ai/gateway.ts` |
| Agent prompts | `src/lib/ai/agents/[agent]/prompts/` |
| Agent tools (allowed-set) | `src/lib/ai/agents/[agent]/tools.ts` |
| Agent runtime (the loop) | `src/lib/ai/agents/[agent]/run.ts` |
| Agent evals | `src/lib/ai/evals/[agent]/` |
| ERP entity types | `src/types/erp.ts` |
| ERP business logic | `src/lib/erp/[entity]/` |
| Integration adapters | `src/lib/integrations/[service]/` |
| Domain events | `src/lib/events/` |
| Tool registry | `src/lib/ai/tools/registry.ts` |

---

## Phasing

Agents ship incrementally. Build phases (sequence in `Phase[N]_Implementation_Plan.md`):

| Phase | Theme | Agents Live |
|-------|-------|-------------|
| Phase 1 | Foundation | LeadAgent + BookingAgent + CommsAgent (the inquiry → booking loop) |
| Phase 2 | Money | + BillingAgent (deposit, final payment, chasing) |
| Phase 3 | Workflow Completion | + ExpenseAgent + DeliveryAgent |
| Phase 4 | Multi-agent Orchestration | Proactive cross-agent flows, escalation pathways |

The Phase 1 trio is non-negotiable: a photographer's most painful flow is "lead arrives → must become booked-and-deposited within 48 hours." That's the cradle. Everything else is built on it.

---

## Boundaries — What This File Does NOT Cover

| Concern | Lives in |
|---------|----------|
| Specific ERP entity definitions | `ERP_DATA_MODEL.md` |
| Specific external system contracts | `INTEGRATION_REGISTRY.md` |
| Specific prompt versions / eval contents | `AGENT_PROMPT_REGISTRY.md` (deferred) |
| Schema migrations | `migrations/migration_[NNN]_*.sql` |
| API route patterns | `personas/PERSONA_ARCH.md` |
| Implementation patterns, file structure, TS standards | `personas/PERSONA_DEV.md` |
| OAuth token storage, RLS rules | `SECURITY.md` |
| Anti-patterns | `ANTI_PATTERNS.md` |

---

*Lens | Agent Architecture | Last updated: [DATE]*
