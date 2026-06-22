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

### LENS-D-021 — BookingAgent: reads-then-writes, retry-to-recover, three-way entry predicate
**Date:** 2026-06-22
**Phase:** Phase 1 | Sprint 3
**Status:** ✅ Active

**Decision:** BookingAgent uses three boundary-shaping patterns:
1. **Reads-then-writes ordering** — Package selection (gateway call) is a pure read. If the model returns no-match, the agent exits with zero writes. Client conversion and booking creation only happen after a validated selection.
2. **Retry-to-recover over rollback** — If createBooking fails after convertLeadToClient succeeds, the lead is left in `converted` state with a minted client. On re-run, the entry predicate detects `converted` and skips conversion, retrying only the booking write. No rollback, no orphan cleanup job.
3. **Three-way entry predicate** — `qualification_status === 'qualified'` → full sequence; `=== 'converted'` → skip to booking (recovery path); anything else → reject early with zero reads beyond getLead.

**Options Considered:**
| Option | Pros | Cons |
|--------|------|------|
| Reads-then-writes (chosen) | Zero-write exit on no-match; no orphan clients from failed bookings when model says "no fit" | Requires two gateway calls if we ever need a second model decision post-conversion |
| Interleaved writes + compensating rollback | Familiar transactional pattern | Can't un-publish domain events; compensating logic is complex and fragile |
| Retry-to-recover (chosen) | Idempotent re-entry; append-only event trail stays honest; no cleanup jobs | Lead stays in `converted` with no booking until retry succeeds; operator sees partial state in the interim |
| Orphan-cleanup background job | Eventually consistent | Extra infrastructure; race conditions with legitimate re-runs; event trail shows "created then deleted" |

**Choice:** Reads-then-writes + retry-to-recover. The converted state IS the recovery signal — no external coordination needed.

**Implications:**
- Case 10 (recovery cycle test) verifies the invariant: convertLeadToClient exactly once across both runs.
- Any future agent that hands off to BookingAgent must pass a `qualified` or `converted` lead; anything else is rejected at the gate.
- The `converted + null converted_client_id` state is a defensive error, not a valid path — it means data corruption.

**Revisit Trigger:** If we add a second write before booking (e.g., contract generation) that can also fail, the retry-to-recover pattern needs extension — the entry predicate must distinguish "converted but no contract" from "converted with contract but no booking."

---

### LENS-D-020 — Habit lens is a conditional review gate; CC emits, reviewer verifies
**Date:** 2026-06-22
**Phase:** Phase 1 | Sprint 3
**Status:** ✅ Active

**Decision:** The seven HABIT_DESIGN.md rules apply to user-surface tickets only (dashboard, onboarding, notification, agent-sent comms); N/A for pure ERP-layer work. Rules 4 (dashboard accuracy) and 6 (no gamification) are blocking merge-stoppers; the other five are advisory. CC emits a filled HABIT LENS block on user-surface PRs; reviewer verifies FAILs against rendered output.

**Options Considered:**
| Option | Pros | Cons |
|--------|------|------|
| CC-emitted structured block (chosen) | Consistent with existing discipline (test counts, diffs); artifact-based review; obligation visible at session start via PERSONA_PM.md | Adds output to PR writeup |
| Reviewer-only mental checklist | No CC overhead | Leaves no artifact or trace; reviewer-dependent; no enforcement consistency |
| Apply to all tickets unconditionally | Simpler rule | Dilutes the gate on ERP-only tickets where no surface exists to score |

**Choice:** CC emits on user-surface tickets; reviewer verifies against rendered output.

**Rationale:** Lens's review discipline is artifact-based — CC produces structured output (test counts, eval results, diffs), reviewer verifies against the real thing. The habit lens follows the same pattern. Mechanics live in `PERSONA_PM.md` (the file CC reads for scope decisions); rule definitions stay in `HABIT_DESIGN.md` to avoid duplication drift. `CLAUDE.md` carries pointers only.

**Implications:**
- Every user-surface PR includes a HABIT LENS output block.
- Rule 4 / 6 FAIL = merge blocker, same weight as a failing test.
- Rules 1, 2, 3, 5, 7 are advisory — logged, not blocking.
- Pure ERP tickets (LeadAgent qualification, entity writes, evals) are N/A — no forced scoring.

**Revisit Trigger:** First user-surface ticket ships (likely the morning-sweep dashboard). Verify the gate works in practice — is the output block useful to the reviewer, or is it ceremony?

---

### LENS-D-019 — source_message_id stored as interim intent_summary sentinel pending dedicated column
**Date:** 2026-06-22
**Phase:** Phase 1 | Sprint 3
**Status:** ✅ Active

**Decision:** LENS-015 enforces lead idempotency by `source_message_id`, but adding a real column requires a migration deferred past 015. Interim: the ID is stored as a trailing namespaced sentinel (`\n\n[lens:src_msg_id=<id>]`) appended to `intent_summary`, matched by anchored LIKE (`%[lens:src_msg_id=<id>]`). This is acknowledged interim debt. No database-level unique constraint exists yet. RLS is the sole tenant boundary — `findLeadBySourceMessage` does not filter by `photographer_id` at the app layer.

**Options Considered:**
| Option | Pros | Cons |
|--------|------|------|
| Trailing sentinel in `intent_summary` (chosen) | Works today; no migration; deliberate namespaced format avoids content collision; single write site | Structured key in a free-text field; requires strip-on-display; LIKE scan |
| Leading prefix (`[src:{id}] ...`) | Simpler LIKE anchor | Collides with real content starting with `[src:`; written inconsistently across code paths |
| Separate `source_message_id` column + unique index | Cleanest long-term; DB-enforced dedup | Schema change + migration + backfill; not justified until async ingestion exists |

**Choice:** Trailing sentinel for Sprint 3; dedicated column at next migration.

**Rationale:** The current ingestion path is synchronous and single-process — app-level dedup is sufficient. The `[lens:src_msg_id=<id>]` namespace avoids collision with user-authored content. The sentinel is appended in exactly one code path (`run.ts`, when constructing `intentSummary` for `createLead`). When reading `intent_summary` back for display (LENS-016+), the sentinel must be stripped.

**Implications:**
- LeadAgent checks `findLeadBySourceMessage()` before `createLead()`.
- `findLeadBySourceMessage` relies on RLS for tenant scoping — no app-layer `photographer_id` filter.
- Under concurrent ingestion, a duplicate lead could slip through. Acceptable while ingestion is synchronous/manual.
- Display layer must strip the trailing sentinel when surfacing `intent_summary` to users.

**Revisit Trigger:** Next migration runs — add a real `lead.source_message_id` column with a unique index on `(photographer_id, source_message_id)`. That index becomes the real idempotency enforcement; the app-level check + sentinel are removed; existing sentinels are backfilled into the column.

---

### LENS-D-018 — Agent evals are fixture-only; CI-gated
**Date:** 2026-06-22
**Phase:** Phase 1 | Sprint 3
**Status:** ✅ Active

**Decision:** Agent eval tests replay frozen gateway responses (fixtures), never make live LLM calls. The eval suite runs as a dedicated CI job (`test-evals`). Live model validation happens at fixture-recording time, not per-push.

**Options Considered:**
| Option | Pros | Cons |
|--------|------|------|
| Fixture-only evals (chosen) | Deterministic; no API key needed in CI; fast; tests agent logic, not model quality | Stale fixtures can mask model regressions; requires manual fixture re-recording when prompts change |
| Live LLM evals in CI | Tests real model behavior every push | Non-deterministic; slow; requires API key as CI secret; flaky by nature; expensive |
| No evals in CI, local-only | Simple | Same rot trajectory as RLS before D-016 |

**Choice:** Fixture-only, CI-gated.

**Rationale:** Agent evals exist to verify that deterministic agent code (decision mapping, ERP writes, event publishing) behaves correctly given a known model output. The model's judgment quality is validated once when the fixture is recorded. Per-push CI re-verification of model quality is the wrong test — it's non-deterministic, slow, and expensive. Fixtures make evals as reliable and fast as unit tests.

**Implications:**
- `npm run test:evals` runs in a `test-evals` CI job, no secrets required.
- Gateway eval mode returns registered fixtures instead of calling the Anthropic API.
- When a prompt version changes, affected fixtures must be re-recorded against the new prompt and re-frozen.
- `LENS_GATEWAY_MODE=eval` is set in test setup, not in CI env.

**Revisit Trigger:** A model regression slips through that fixture evals couldn't catch (e.g., a prompt change that passes Zod validation but produces semantically wrong judgments). At that point, add a periodic live-model smoke test on a schedule, not per-push.

---

### LENS-D-016 — RLS verified in CI via dedicated test project, fails-closed
**Date:** 2026-06-21
**Phase:** Phase 1 | Sprint 2
**Status:** ✅ Active

**Decision:** RLS isolation is verified in CI by running the full cross-tenant test suite (`npm run test:rls`) against a dedicated Supabase test project. The CI job fails-closed: missing secrets or a production project URL causes a hard failure, not a silent skip.

**Options Considered:**
| Option | Pros | Cons |
|--------|------|------|
| RLS tests in local Supabase CLI (`supabase start`) | No external dependency; fully offline | CLI's local Postgres doesn't replicate hosted RLS edge cases; auth emulator behavior differs from hosted; adds Docker dependency to CI |
| RLS tests against hosted test project (chosen) | Tests real RLS policies as deployed; same auth flow as production; catches policy drift | Requires CI secrets; network dependency; test project must be maintained |
| RLS tests against production with test users | Zero infrastructure; tests the real thing | Mutates production data; cleanup failures leak test rows; violates ANTI_PATTERNS #7 spirit |
| Skip RLS testing in CI, manual only | Simple | Isolation verification drifts back to assumption — the exact failure mode LENS-013 existed to kill |

**Choice:** Hosted test project with fails-closed CI job.

**Rationale:** The whole point of LENS-013 was to make tenant isolation a verified property, not an assumption. If the verification only runs locally and never in CI, it rots within one sprint. The test project (`eqqfukokwtwqwcqqeneo`) is isolated from production data. The host assertion (`grep -q "vvcuennzifsovbbylolx"` → exit 1) prevents credential misconfiguration from mutating Morgan's data. Fails-closed means a broken secret config surfaces immediately rather than producing a green checkmark that proves nothing.

**Implications:**
- Three CI secrets required: `TEST_SUPABASE_URL`, `TEST_SUPABASE_ANON_KEY`, `TEST_SUPABASE_SERVICE_ROLE_KEY`.
- The test project must have the same migrations applied as production. Migration application is manual (ANTI_PATTERNS #1), so both projects must be updated in the same session.
- `npm test` excludes `tests/rls/**` — the fast unit loop stays fast. RLS runs separately.
- The grep gate for ANTI_PATTERNS #37 is line-scoped (known limitation, documented).

**Revisit Trigger:** If Supabase CLI's local auth emulator reaches parity with hosted RLS behavior, local-only testing becomes viable and removes the network/secret dependency.

---

### LENS-D-017 — Event-trail-as-versioning (no version columns)
**Date:** 2026-06-21
**Phase:** Phase 1 | Sprint 2
**Status:** ✅ Active

**Decision:** Entity tables have no `version`, `revision`, or `updated_by` columns. Change history is derived exclusively from `domain_event_log`.

**Options Considered:**
| Option | Pros | Cons |
|--------|------|------|
| Row-level version columns (`version int`, `updated_by text`) | Easy "last modified" query; no join needed | Duplicates event log; write amplification on every update; drift risk between column and log; doesn't capture *what* changed |
| Event log as sole history source (chosen) | Single source of truth; captures full change semantics (event type + payload); no duplication; no extra write per update | Requires event log query + join for "who changed this last"; query is slightly more complex |
| Both (columns + event log) | Maximum queryability | Maximum duplication; guaranteed drift over time |

**Choice:** Event log only.

**Rationale:** The `domain_event_log` already stores typed events with timestamps and payloads for every write. Adding version columns would duplicate this information, introduce a consistency surface (column says version 3 but only 2 events exist), and add a write to every update. The event log captures *what* changed (event type) and *to what* (payload), which version columns cannot. The cost is a slightly more complex "last modified" query — acceptable given the log is already indexed by `photographer_id`.

**Implications:**
- "Who changed this entity last?" → `SELECT * FROM domain_event_log WHERE type LIKE '[entity].%' AND payload->>'[entity]_id' = $1 ORDER BY created_at DESC LIMIT 1`.
- If future UI needs a "last modified" timestamp without a join, the answer is a materialized view or denormalized cache — not a column on the entity table.
- No `updated_by` column means agent attribution lives in event payloads only.

**Revisit Trigger:** If query latency for "last modified" becomes a production issue measured in p95, add a materialized view. Do not add columns.

---

### LENS-D-015 — ERP write-then-publish non-atomicity
**Date:** 2026-06-19
**Phase:** Phase 1 | Sprint 2
**Status:** ✅ Active

**Decision:** ERP write modules use a write-first-then-publish pattern. The row is written to Supabase, then the domain event is published via the event bus. These two operations are not atomic.

**Options Considered:**
| Option | Pros | Cons |
|--------|------|------|
| RPC-wrapped transaction (row + event log in one `BEGIN/COMMIT`) | Atomic — no orphans possible | Supabase JS client doesn't expose transactions; `publish()` does in-memory subscriber dispatch after the DB insert, which can't be inside a Postgres transaction; fighting the client library |
| Write row first, then publish event (chosen) | Works with existing client; orphaned row is detectable and recoverable; subscriber dispatch order is correct | Non-atomic — row can exist without event, or (in `convertLeadToClient`) client row can be orphaned if lead update fails |
| Publish event first, then write row | Subscribers could pre-notify | Event without a row is unrecoverable — subscribers act on phantom data; worse failure mode |

**Choice:** Write-first-then-publish with loud failure.

**Rationale:** A row without an event is detectable (query rows with no matching `domain_event_log` entry) and recoverable (republish). An event without a row causes downstream subscribers to act on data that doesn't exist — unrecoverable without compensating events. The caller always sees the failure via the `warning` field on `ErpResult`, and the failure is logged to stdout via `console.error`.

**Known orphan cases (severity-ordered):**
1. **`convertLeadToClient` — orphaned client row** (higher severity): Client creation succeeds but lead status update fails. A client row exists that no lead references. The hard error returned to the caller includes the orphaned client's ID in `error.detail` so the orphan is traceable. No compensating delete — that's new failure surface for a deferred problem. Tested explicitly.
2. **Any write — orphaned row without event**: Row writes to Supabase but `publish()` throws (e.g., `domain_event_log` insert fails). Row exists, event trail has a gap. Caller receives `{ data: <row>, warning: "event_publish_failed: ..." }`. `console.error` ensures it's visible in Vercel logs even if the caller ignores the warning.

**Implications:**
- Every ERP write function returns `ErpResult<T>` where `data` is never null when the row wrote successfully — even if the event failed. Callers must check `warning` to detect event gaps.
- `convertLeadToClient` returns hard `db_error` (not warning) when the lead update fails, because the domain operation (conversion) did not complete — even though the client row exists.
- No compensating deletes or rollbacks in Sprint 2 — the orphan is logged and traceable, not silently cleaned up.

**Revisit Trigger:** D-011 (durable queue) resolves the event orphan. An RPC-wrapped `convertLeadToClient` or Postgres function resolves the client orphan. Either would make both operations atomic.

---

### LENS-D-014 — Eval harness bypasses gateway in Sprint 2
**Date:** 2026-05-09
**Phase:** Phase 1 | Sprint 2
**Status:** ✅ Active

**Decision:** The eval runner uses fixture-provided `mockOutput` as the "actual" response rather than calling through the gateway. The gateway's eval mode toggle (`GatewayEvalNotConfiguredError`) is not wired to a fixture provider.

**Options Considered:**
| Option | Pros | Cons |
|--------|------|------|
| Wire fixture provider into gateway eval mode | End-to-end path tested; gateway eval toggle works | Couples harness to gateway internals; premature — no real fixtures exist; extra complexity for Sprint 2 |
| Bypass gateway, compare fixture fields directly (chosen) | Harness comparison logic tested in isolation; no gateway coupling; simpler; Sprint 3 can wire the gateway path when real fixtures exist | Doesn't exercise gateway eval mode; that path throws `GatewayEvalNotConfiguredError` until wired |

**Choice:** Bypass gateway.

**Rationale:** Sprint 2 ships the harness skeleton — the comparison and reporting logic is the deliverable. No real agent fixtures exist yet. Wiring fixture playback through the gateway adds coupling to a path that will change when prompt versioning ships (Sprint 3). The gateway's eval mode already throws `GatewayEvalNotConfiguredError` with a clear message directing future work. Testing comparison logic in isolation is more valuable than testing plumbing that will be rewritten.

**Implications:**
- `runner.ts` does not import `gateway.ts` or `@anthropic-ai/sdk`.
- Sprint 3 wires the gateway's eval mode to load fixtures and replay them, then the runner calls through the gateway.
- The `GatewayEvalNotConfiguredError` message documents this deferral.
- Eval results are stdout-only — no DB table or file persistence. Consistent with the ZDR posture (no prompt/response content stored) and sufficient for the skeleton; revisit when eval volume justifies persistence.

**Revisit Trigger:** Sprint 3 — when LeadAgent ships its first real fixtures.

---

### LENS-D-013 — Gateway logs stdout-only for Sprint 2
**Date:** 2026-05-09
**Phase:** Phase 1 | Sprint 2
**Status:** ✅ Active

**Decision:** Gateway structured logs go to stdout only. No DB-backed log persistence table. Vercel's observability layer captures stdout.

**Options Considered:**
| Option | Pros | Cons |
|--------|------|------|
| Stdout only (chosen) | Zero new tables; Vercel captures it; no ANTI_PATTERNS #37 surface area; sufficient for single-photographer design-partner phase | Not queryable without Vercel log search; no long-term retention guarantees |
| DB-backed `gateway_call_log` table | Queryable; durable; supports analytics dashboards | New table + migration; every write needs `{ error }` handling per ANTI_PATTERNS #37; premature for Phase 1 |

**Choice:** Stdout only.

**Rationale:** Phase 1 serves one photographer. Gateway call volume is low (tens per day). Vercel's log retention is sufficient for debugging. Adding a DB table creates a new surface for the silent-write-failure bug that hit LENS-006 and LENS-007 (ANTI_PATTERNS #37). The analytics benefit doesn't justify the complexity until multiple photographers are active.

**Implications:**
- Gateway call analysis requires Vercel log search, not SQL queries.
- If DB persistence is added later, each write must check `{ error }` and either throw or `console.error`, matching `writeLogRow` in the tool registry.

**Revisit Trigger:** When analytics on gateway calls (cost tracking, latency percentiles, per-agent token budget) becomes a product requirement.

---

### LENS-D-012 — Permission rejections not logged to agent_tool_call_log
**Date:** 2026-05-09
**Phase:** Phase 1 | Sprint 2
**Status:** ✅ Active

**Decision:** When `callTool` rejects a call due to `agentId` not being in `allowedAgents`, the rejection is logged to `console.error` but NOT written to the `agent_tool_call_log` table. The function throws `ToolPermissionError` immediately.

**Options Considered:**
| Option | Pros | Cons |
|--------|------|------|
| Don't log to DB, log to console.error (chosen) | Clean separation: `agent_tool_call_log` contains actual tool calls (successful or failed), not refused calls; misuse is still observable in server logs | Permission abuse won't show up in photographer-facing audit views built on `agent_tool_call_log` |
| Log to DB with `status: 'permission_denied'` | Misuse visible in audit table; easy to query | Conflates "this tool was called and failed" with "this tool was never called"; pollutes the log with non-calls; `status` column in migration is free-text but semantically intended for `ok`/`error` of actual calls |

**Choice:** Console.error only; no DB row.

**Rationale:** A permission rejection is not a tool call — it's a refused tool call. The `agent_tool_call_log` table is an audit log of what tools actually executed (or attempted execution and failed). A permission check fires before the handler runs, before input is hashed, before any work happens. Logging it to the same table muddies the semantics. `console.error('tool_permission_rejected', { tool_name, agent_id })` makes misuse observable in server logs, matching the event bus precedent where handler errors go to `console.error` rather than a separate DB table.

**Implications:**
- Permission-rejection monitoring requires searching server logs, not querying `agent_tool_call_log`.
- If a security audit requires queryable permission rejection history, add a separate `agent_security_event_log` table — don't overload the tool call log.

**Revisit Trigger:** If permission rejections need to be queryable (e.g., for a security dashboard or rate-limiting misbehaving agents).

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
| LENS-D-019 | Dedup app-enforced; unique index deferred | 2026-06-22 | Architecture | ✅ Active |
| LENS-D-018 | Agent evals fixture-only, CI-gated | 2026-06-22 | Architecture | ✅ Active |
| LENS-D-015 | ERP write-then-publish non-atomicity | 2026-06-19 | Architecture | ✅ Active |
| LENS-D-014 | Eval harness bypasses gateway in Sprint 2 | 2026-05-09 | Architecture | ✅ Active |
| LENS-D-013 | Gateway logs stdout-only for Sprint 2 | 2026-05-09 | Architecture | ✅ Active |
| LENS-D-012 | Permission rejections not in agent_tool_call_log | 2026-05-09 | Architecture | ✅ Active |
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

*Lens | Decisions Log | Last updated: 2026-06-22*
