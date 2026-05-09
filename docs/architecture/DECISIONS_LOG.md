# DECISIONS LOG
## Lens — Architectural & Product Decisions

> **Purpose**: Every significant decision that affects how Lens is built, and *why*. Claude Code hallucinates context from prior conversations — this file is the antidote. When CC asks "why is it done this way?", the answer is here.
>
> **What belongs here**: Schema choices, tech stack selections, integration approaches, security tradeoffs, UX direction decisions, anything that was a real decision between two viable options. Do NOT log obvious choices.
>
> **Format**: Decision → Options Considered → Choice → Rationale → Implications → Revisit Trigger. Newest entries first.

---

## Active Decisions

---

### LENS-D-011 — Event bus is in-memory; durable queue deferred
**Date:** 2026-05-06
**Phase:** Phase 1 | Sprint 2
**Status:** ✅ Active

**Decision:** The domain event bus (`src/lib/events/bus.ts`) is in-memory pub/sub. No durable queue, no retry, no dead-letter handling.

**Options Considered:**
| Option | Pros | Cons |
|--------|------|------|
| In-memory pub/sub (chosen) | Zero infrastructure; testable with mocked Supabase; sufficient for Phase 1 agent count (3) and traffic (single photographer) | Events lost on crash; no retry for failed handlers; no ordering guarantees across server restarts |
| Postgres-backed queue (SKIP LOCKED) | Durable; retryable; built on existing infra | Polling overhead; complex for 3 agents; over-engineered for design-partner scale |
| External queue (SQS / Inngest / Trigger.dev) | Production-grade; retry + DLQ built in | New dependency; vendor lock; premature for Phase 1 |

**Choice:** In-memory pub/sub.

**Rationale:** Phase 1 serves one photographer (Morgan) with three agents. Event volume is low (tens per day). The bus persists every event to `domain_event_log` before dispatching to handlers, so even if a handler fails, the event record exists for manual replay. Durability and retry become load-bearing in Phase 2 when BillingAgent processes payment webhooks — that's the right trigger to upgrade.

**Implications:**
- Handler errors are swallowed (logged, not retried). A failed handler means the side effect didn't happen; the event is still in `domain_event_log`.
- Subscribers are awaited sequentially — no parallel dispatch. Acceptable at Phase 1 scale.
- No event ordering guarantees beyond single-publish scope.

**Revisit Trigger:** Phase 2 kickoff, or the first time a handler failure causes data inconsistency in production.

---

### LENS-D-010 — Token encryption key validation is per-call, not at module load
**Date:** 2026-05-06
**Phase:** Phase 1 | Sprint 2
**Status:** ✅ Active

**Decision:** `getKeyForVersion()` validates `TOKEN_ENCRYPTION_KEY` on every encrypt/decrypt call rather than caching at module load.

**Options Considered:**
| Option | Pros | Cons |
|--------|------|------|
| Per-call validation (chosen) | Tests can swap env vars between cases without module reload; simpler code; no global mutable state | Redundant base64 decode + length check on every call |
| Module-load cache in `Map<number, Buffer>` | Fail-fast at server startup; zero per-call overhead | Tests need `vi.resetModules()` or dynamic imports to swap keys; adds module-level mutable state |

**Choice:** Per-call validation.

**Rationale:** The cost is negligible (one base64 decode of 32 bytes). The benefit is test ergonomics — the test suite swaps `TOKEN_ENCRYPTION_KEY` between cases to test wrong-key and missing-key scenarios. A module-load cache would require resetting module state per test, adding complexity without meaningful performance gain (OAuth token encrypt/decrypt is not a hot path).

**Implications:**
- Misconfiguration surfaces at first encrypt/decrypt call, not at server boot.
- If fail-fast at startup becomes important (e.g., health check endpoint), add an explicit `validateTokenConfig()` export that routes call on startup.

**Revisit Trigger:** If token encrypt/decrypt becomes a hot path (unlikely — it's per-OAuth-refresh, not per-request).

---

### LENS-D-009 — booking.status defaults to 'tentative'
**Date:** 2026-05-06
**Phase:** Phase 1 | Sprint 2
**Status:** ✅ Active

**Decision:** `booking.status` has a SQL default of `'tentative'`.

**Options Considered:**
| Option | Pros | Cons |
|--------|------|------|
| Default `'tentative'` (chosen) | Matches domain lifecycle — a booking exists before contract signed + deposit paid; every `INSERT` would pass `'tentative'` anyway | ERP data model doesn't specify a default, so this is a migration-level judgment call |
| No default, require caller to specify | Explicit; no hidden state | Adds ceremony with zero flexibility — tentative is the only valid initial state |

**Choice:** Default `'tentative'`.

**Rationale:** The booking state machine in DOMAIN_GLOSSARY.md defines the lifecycle: `tentative` → `confirmed` (on contract signed + deposit paid) → `completed` (session date passed) or `cancelled`. A booking can't start as `confirmed` (nothing is signed), `completed` (nothing happened), or `cancelled` (nothing to cancel). `tentative` is the only valid initial value, so forcing callers to specify it is ceremony without benefit.

**Implications:**
- `INSERT INTO booking` without specifying status produces a tentative booking.
- Application code should transition to `confirmed` only after contract + deposit conditions are met.
- If a future status (e.g., `draft`) emerges that precedes `tentative`, the default changes and existing code that relies on it must be audited.

**Revisit Trigger:** If a booking creation flow emerges where `tentative` is not the correct initial state.

---

### LENS-D-008 — comm_sequence column renamed from "trigger" to trigger_event
**Date:** 2026-05-06
**Phase:** Phase 1 | Sprint 2
**Status:** ✅ Active

**Decision:** Renamed `comm_sequence.trigger` to `trigger_event`.

**Options Considered:**
| Option | Pros | Cons |
|--------|------|------|
| `trigger_event` (chosen) | Describes what the column holds (the event that fires the sequence); avoids reserved word; reads naturally alongside values like `'booking.created'`, `'session.approaching'` | Slightly longer than the ERP model's shorthand |
| `trigger_type` | Short; familiar naming pattern | Implies a category/enum, not a specific event; `type` is also an overloaded word in TypeScript contexts |
| `trigger_name` | Short | Implies a human-readable label, not a machine-routable event identifier |
| `"trigger"` (quoted) | Matches ERP model exactly | Every query, TypeScript type, Supabase client call, and test fixture must double-quote the column forever; grep for the column name also matches PostgreSQL's `CREATE TRIGGER` syntax |

**Choice:** `trigger_event`.

**Rationale:** The column stores the domain event that causes a comm sequence to fire (e.g., `'booking.created'`, `'session.approaching'`, `'payment.overdue'`). `trigger_event` is the most precise name for that semantic — it's an event, not a type or a label. The reserved-word problem with `trigger` makes this a zero-cost rename now vs. a codebase-wide find-and-replace later. ERP_DATA_MODEL.md updated to match.

**Implications:**
- All code referencing this column uses `trigger_event` unquoted.
- Feature specs and CC prompts should use `trigger_event`, not `trigger`.

**Revisit Trigger:** Never — naming is locked once the first comm_sequence row is written.

---

### LENS-D-007 — Removed chaining-mode workflow from playbook
**Date:** 2026-05-06
**Phase:** Phase 1 | Sprint 2
**Status:** Decided

**Decision:** Removed the ORCHESTRATOR-driven feature chaining workflow (queue/active/completed states, gate reports, SQL manifests) from DEVELOPMENT_PLAYBOOK.md and CC_PROMPT_TEMPLATE.md. Speculative, untested, never used; created drift between docs and reality. Standard per-sprint workflow is the only execution path. Re-introduce only with real-use justification.

---

### LENS-D-006 — Working name "Lens" as placeholder
**Date:** 2026-05-04
**Phase:** Pre-Phase 1 | Setup
**Status:** ⚠️ Under Review (placeholder)

**Decision:** Use "Lens" as the working project name and ticket prefix (LENS) until a permanent name is committed.

**Options Considered:**
| Option | Pros | Cons |
|--------|------|------|
| Lens (chosen placeholder) | Generic enough to find/replace; on-domain | Generic — not unique enough as a permanent name |
| Pick permanent name now | Build identity from day one | Premature; product positioning still evolving |
| No project name yet | Forces explicit choice later | Code references awkward without a name |

**Choice:** Lens.

**Rationale:** The product thesis is well-formed; the brand is not. Better to ship internal docs and code with a working name than burn a name decision before market positioning is clear.

**Implications:**
- All code, file names, and tickets use `LENS` / `Lens`.
- A find-and-replace pass commits the permanent name when it's chosen.
- Domain registration and trademark search deferred until after Phase 1 demo.

**Revisit Trigger:** When the first paying customer is signed, or when external announcement is imminent.

---

### LENS-D-005 — Six agents, phased introduction
**Date:** 2026-05-04
**Phase:** Pre-Phase 1 | Architecture
**Status:** ✅ Active

**Decision:** Lens has six agents — Lead, Booking, Comms, Billing, Expense, Delivery. Phase 1 ships Lead + Booking + Comms. Phase 2 adds Billing. Phase 3 adds Expense + Delivery.

**Options Considered:**
| Option | Pros | Cons |
|--------|------|------|
| Six agents, phased (chosen) | Each agent has a coherent ownership boundary; phases align with cradle-to-grave value chain | Three agents in flight in Phase 1 is non-trivial |
| Single super-agent | Simpler infrastructure | Boundary chaos; eval-in-isolation impossible; prompt complexity unmanageable |
| Two agents (Comms + Operations) | Fewer moving parts | Operations would conflate booking, billing, expense, delivery — each has a distinct domain language |
| Per-feature agents (e.g., one per email template) | Maximum specialization | Combinatorial sprawl; coordination becomes a service mesh |

**Choice:** Six agents, phased.

**Rationale:** Each agent maps to a coherent vertical slice of the photography business with its own vocabulary, tools, and failure modes. Three agents in Phase 1 is the floor for a cradle-to-grave demo (lead → booking → comms is the loop everything else hangs off). Adding Billing in Phase 2 unlocks Morgan's #1 pain (payment chasing). Phase 3 completes the workflow.

**Implications:**
- Six prompt registries, six eval suites, six allowed-tool sets.
- Cross-agent coordination is a first-class architectural concern (covered in `AGENT_ARCHITECTURE.md` § Multi-Agent Coordination).
- Agent count is fixed at six until a vertical slice emerges that none can absorb. Adding a 7th is a logged decision.

**Revisit Trigger:** When a new domain emerges (e.g., teaching/workshops, bookings beyond photo sessions) that doesn't fit any existing agent's boundary.

---

### LENS-D-004 — ERP is source of truth; integrations are side effects
**Date:** 2026-05-04
**Phase:** Pre-Phase 1 | Architecture
**Status:** ✅ Active

**Decision:** When state diverges between Lens's ERP and an external system (Stripe, QuickBooks, Calendar, Gmail), the ERP is canonical. Reconciliation always flows toward the ERP.

**Options Considered:**
| Option | Pros | Cons |
|--------|------|------|
| ERP source of truth (chosen) | Lens is the operating system, not a wrapper; auditability; deterministic behavior | Reconciliation logic non-trivial; webhook reliability matters |
| Stripe-as-source for billing, QB-as-source for accounting | Smaller surface area in Lens | Lens degrades to a UI layer; loses thesis differentiation |
| Eventual consistency, no canonical source | Simpler in the short run | State conflicts inevitable; debugging becomes archaeology |

**Choice:** ERP is source of truth.

**Rationale:** Lens's core thesis is that the photographer's business runs on Lens, not on a constellation of stitched-together SaaS products. That thesis requires Lens to hold canonical state. External systems are downstream destinations and convenience layers; they're not parallel copies.

**Implications:**
- Every webhook dispatches a domain event; agents reconcile to ERP.
- Reconciliation jobs (hourly for Stripe, etc.) catch missed webhooks.
- Refunds and adjustments originate in Lens, never directly in external systems.
- `invoice.quickbooks_invoice_id`, `booking.external_calendar_event_id`, etc. are Lens's pointers to external state — never the other way around.

**Revisit Trigger:** Never, while the thesis holds.

---

### LENS-D-003 — Replace vs Integrate framework
**Date:** 2026-05-04
**Phase:** Pre-Phase 1 | Product
**Status:** ✅ Active

**Decision:** Every external software product Lens encounters is classified as **Replace** (vertical photo SaaS we compete with) or **Integrate** (horizontal infrastructure we plug into). Every feature declares its side.

**Options Considered:**
| Option | Pros | Cons |
|--------|------|------|
| Replace vs Integrate (chosen) | Forces explicit positioning; prevents scope creep into rebuilding what already exists | Some products are ambiguous (e.g., is Calendar competition or infrastructure?) |
| Replace everything | Pure thesis; fewer dependencies | Massive scope; rebuilds commodity infrastructure (calendar, email) |
| Integrate everything | Ship faster | Lens becomes a UI on other people's products; thesis collapses |

**Choice:** Replace vs Integrate.

**Rationale:** This framework keeps the thesis sharp at the feature level. If a feature requires building something already in an Integrate target, that's a flag — it should be an integration, not a feature. If a feature competes head-on with a Replace target, the AI-native angle must be explicit.

**Replace targets (current):** HoneyBook, Pixieset, Session, Studio Ninja, Iris Works, Dubsado, Tave, Pic-Time, Sprout.
**Integrate targets (current):** Gmail, Google Calendar, QuickBooks, Stripe, cloud storage (Drive/Dropbox/R2/S3).

**Implications:**
- Feature specs declare Replace or Integrate posture.
- "Build vs integrate" decisions reference this framework.
- The Integrate list grows with explicit decisions logged here.

**Revisit Trigger:** A category emerges that doesn't fit either side cleanly.

---

### LENS-D-002 — Single LLM gateway; never import SDK elsewhere
**Date:** 2026-05-04
**Phase:** Pre-Phase 1 | Architecture
**Status:** ✅ Active

**Decision:** All LLM calls flow through `src/lib/ai/gateway.ts`. No agent code imports the Anthropic SDK directly.

**Options Considered:**
| Option | Pros | Cons |
|--------|------|------|
| Single gateway (chosen) | Centralized retry, logging, model selection, prompt versioning, eval mode, tool routing | One file to maintain; abstraction overhead |
| Per-agent SDK clients | Agents are independent | Duplicated retry logic; eval-in-isolation broken; prompt versioning fragmented |
| Library wrapper, no enforcement | Flexibility | Drift across agents; no guarantee of consistent behavior |

**Choice:** Single gateway, enforced by `ANTI_PATTERNS.md` rule #21.

**Rationale:** Reuses the proven gateway pattern from the existing marketing-agent monorepo. Centralization is the only way prompt versioning, evals, and ZDR logging stay coherent across six agents. The cost is one file to maintain — small relative to the benefit.

**Implications:**
- All agent runtime goes through `runAgentLoop()` exported from gateway.
- Prompt resolution happens in the gateway, not in agent code.
- Eval mode toggle is a gateway concern; agents are agnostic.
- Adding a second LLM provider is a gateway-only change.

**Revisit Trigger:** Multi-provider strategy that requires per-agent provider selection (unlikely).

---

### LENS-D-001 — Stack: Next.js 15 + Supabase + Anthropic + Vercel
**Date:** 2026-05-04
**Phase:** Pre-Phase 1 | Setup
**Status:** ✅ Active

**Decision:** Build Lens on Next.js 15 (App Router) + TypeScript strict + Tailwind + Supabase + Anthropic Claude SDK + Vercel.

**Options Considered:**
| Option | Pros | Cons |
|--------|------|------|
| Next.js + Supabase + Anthropic (chosen) | Matches existing monorepo + BloxStart pattern; minimal cognitive switching cost; fast iteration | Vendor lock on Vercel + Supabase |
| Next.js + custom Postgres + custom auth | Full control; portable | Slower; reinvents auth/RLS/edge functions |
| Remix / SvelteKit + Supabase | Different framework strengths | Cognitive switch; team velocity hit |

**Choice:** Next.js + Supabase + Anthropic + Vercel.

**Rationale:** Velocity matters more than vendor independence at this stage. The existing monorepo and BloxStart codebase prove this stack works for an agent-on-ERP system at small scale. Supabase RLS plus the gateway pattern give the auth + AI infrastructure for free.

**Implications:**
- Migrations are SQL files applied via Supabase dashboard.
- Auth is Supabase Auth — `auth.uid()` is the photographer ID.
- Deployment is `git push` to `main` via Vercel.
- Schema portability deferred — accept Supabase-specific patterns (RLS, `auth.uid()` in policies).

**Revisit Trigger:** Scale exceeds Supabase's reasonable limits, or a strategic reason to leave Vercel emerges.

---

## Decision Templates by Type

Copy the relevant template when adding a new entry:

### Schema Decision Template
**Decision:** Use [DATA_TYPE] for [COLUMN] in [TABLE].
**Options:** `uuid` vs `bigint` vs `text` | `jsonb` vs normalized | soft vs hard delete
**Choice:** [CHOICE]
**Rationale:** [Why this over alternatives]
**Implications:** [What this means for queries, migrations, API shapes]

### Integration Approach Template
**Decision:** Integrate [SERVICE] via [APPROACH] rather than [ALTERNATIVE].
**Options:** Webhook vs polling | SDK vs raw HTTP | server vs client
**Choice:** [CHOICE]
**Rationale:** [Performance / security / maintainability tradeoffs]
**Implications:** [Where the code lives, what it can/can't do]

### Auth / Security Template
**Decision:** [APPROACH] for [SCENARIO].
**Options:** [JWT vs session | RLS vs app-level | role vs attribute]
**Choice:** [CHOICE]
**Rationale:** [Security posture, DX, compliance]
**Implications:** [Multi-tenancy, admin ops, external API access]

---

## Superseded Decisions

> Move decisions here when reversed. Keep them — future sessions shouldn't re-litigate things already tried.

*(none yet)*

---

## Decision Index

| # | Title | Date | Domain | Status |
|---|-------|------|--------|--------|
| LENS-D-011 | Event bus in-memory; durable queue deferred | 2026-05-06 | Architecture | ✅ Active |
| LENS-D-010 | Token key validation per-call, not module-load | 2026-05-06 | Security | ✅ Active |
| LENS-D-009 | booking.status defaults to 'tentative' | 2026-05-06 | Schema | ✅ Active |
| LENS-D-008 | comm_sequence column renamed to trigger_event | 2026-05-06 | Schema | ✅ Active |
| LENS-D-007 | Removed chaining-mode workflow | 2026-05-06 | Process | ✅ Active |
| LENS-D-006 | Working name "Lens" placeholder | 2026-05-04 | Setup | ⚠️ Under Review |
| LENS-D-005 | Six agents, phased | 2026-05-04 | Architecture | ✅ Active |
| LENS-D-004 | ERP is source of truth | 2026-05-04 | Architecture | ✅ Active |
| LENS-D-003 | Replace vs Integrate framework | 2026-05-04 | Product | ✅ Active |
| LENS-D-002 | Single LLM gateway | 2026-05-04 | Architecture | ✅ Active |
| LENS-D-001 | Stack: Next.js + Supabase + Anthropic + Vercel | 2026-05-04 | Setup | ✅ Active |

---

## Pending Decisions (Surface and Log Soon)

These have been flagged but not yet resolved. Each gets a numbered entry above when committed.

- **Cloud storage provider for v1.** Options: Cloudflare R2, AWS S3, Google Drive (premium tier later). Trigger: Phase 3 planning.
- **Email channel for outbound to clients.** Options: photographer's Gmail (via OAuth), transactional sender (Resend / Postmark), hybrid. Trigger: First non-trivial CommsAgent flow.
- **Permanent project name.** Trigger: Pre-launch positioning.

---

*Lens | Decisions Log | Last updated: 2026-05-04*
