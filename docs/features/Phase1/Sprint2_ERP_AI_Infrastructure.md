# Sprint 2 — ERP Completion & AI Infrastructure

> **Phase:** 1 — Foundation (Lead → Booking → Comms loop)
> **Sprint:** 2 of ~4 in Phase 1
> **Tickets:** LENS-003 through LENS-014 (12 tickets)
> **Sprint goal:** Every ERP table the cradle needs + every piece of AI plumbing the first agent will sit on. **No LLM calls. No Gmail. No agent prompts. No new UI.**
> **Why this sprint exists:** LeadAgent (Sprint 3) cannot ship without these foundations. Building them inside Sprint 3 would conflate "did the agent work" with "did the gateway work" and make eval-in-isolation impossible.

---

## Non-Goals (Read This First)

This sprint deliberately does NOT include:

- Any LLM API call to Anthropic (gateway must support it; nothing must use it).
- Any agent prompts, runtimes, or evals beyond the harness skeleton.
- Gmail, Calendar, Stripe, QuickBooks, or Storage adapters.
- Any new UI surface.
- Migration of mock-driven dashboard pages to real Supabase data.
- Invoice, payment, expense, or deliverable tables (Phase 2/3).

If a PR in this sprint touches any of the above, scope is wrong — push it to Sprint 3+ or split it out.

---

## Outcome Definition

By end of sprint, the following are true:

1. Migration 002 applied; 9 new tables exist with RLS + photographer-scoped policies.
2. `src/lib/ai/gateway.ts` exists and is the only file importing `@anthropic-ai/sdk`. It supports prompt-version resolution, structured logging (token counts only — never content), retry policy, and an eval-mode toggle that replays from fixtures without hitting the live API.
3. `src/lib/ai/tools/registry.ts` exists; tools are registered with Zod input/output schemas; per-agent permission allow-lists are enforced at registration.
4. `src/lib/events/bus.ts` exists with typed `publish()` / `subscribe()`; domain event types live in `src/types/events.ts`.
5. `src/lib/crypto/tokens.ts` encrypts/decrypts via AES-256-GCM, keyed by `TOKEN_ENCRYPTION_KEY`, with a `key_version` column on `integration_credentials` to support future rotation.
6. `src/lib/ai/evals/runner.ts` can replay a fixture through the gateway in eval mode and produce pass/fail output. Zero real fixtures yet — the harness itself is the deliverable.
7. `npx tsc --noEmit` clean, `npm run lint` clean, all migrations applied in Supabase, all RLS policies verified by automated test.

---

## Tickets

### LENS-003 — Migration 002: Phase 1 ERP entities

**File:** `supabase/migrations/migration_002_phase1_erp.sql`

Adds nine tables. Every table:
- RLS enabled in the same migration.
- At least one photographer-scoped policy.
- FK columns indexed.
- `created_at` / `updated_at` (where mutable) with the existing `set_updated_at` trigger.
- `deleted_at timestamptz nullable` for user-generated data.

Tables (exact columns per `ERP_DATA_MODEL.md`):

| # | Table | Notes |
|---|---|---|
| 1 | `package` | session_type check constraint matches glossary values |
| 2 | `location` | `category` check constraint: `nature_rustic`, `downtown`, `studio`, `beach`, `custom` |
| 3 | `booking` | status check constraint; FKs to client, package, contract (nullable), invoice (nullable, defined as text now — real FK in Phase 2) |
| 4 | `booking_location` | join with `sequence int`; same-category constraint via trigger function (see below) |
| 5 | `contract` | `signed_at timestamptz nullable`; `signature_image_url`, `signed_ip` |
| 6 | `comm_log` | **Append-only.** RLS policies allow `select` and `insert`. **No `update` or `delete` policies.** Verify in test. |
| 7 | `comm_sequence` | `steps jsonb not null` |
| 8 | `comm_sequence_state` | per-client progression |
| 9 | `integration_credentials` | unique on `(photographer_id, service)`; `access_token_ciphertext bytea`, `refresh_token_ciphertext bytea`, `key_version int not null default 1` |
| 10 | `agent_tool_call_log` | append-only; index on `(photographer_id, called_at desc)` |

**Same-category constraint for `booking_location`:**

A SQL `CHECK` constraint can't span rows. Implement as a trigger function:

```sql
create or replace function enforce_booking_location_same_category()
returns trigger as $$
declare
  existing_category text;
  new_category text;
begin
  select l.category into new_category from location l where l.id = new.location_id;
  select l.category into existing_category
    from booking_location bl
    join location l on l.id = bl.location_id
    where bl.booking_id = new.booking_id
    limit 1;
  if existing_category is not null and existing_category != new_category then
    raise exception 'booking_location category mismatch: booking % already has category %, cannot add %',
      new.booking_id, existing_category, new_category;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger booking_location_same_category
  before insert or update on booking_location
  for each row execute function enforce_booking_location_same_category();
```

**AC:**
- [ ] Migration file generated, not executed via CC.
- [ ] All 10 tables have RLS + at least one photographer-scoped policy.
- [ ] All FK columns indexed.
- [ ] `comm_log` and `agent_tool_call_log` have no UPDATE or DELETE policies (append-only verified).
- [ ] Same-category trigger rejects mismatched inserts (verified by SQL test in PR description).
- [ ] After applying, `CLAUDE.md` Current Build State updated.

---

### LENS-004 — Type definitions for ERP entities

**Files:**
- `src/types/erp.ts` — TypeScript interfaces for all 10 new entities + the 3 from migration 001.
- `src/types/events.ts` — typed domain events (placeholder for now: `BookingCreatedEvent`, `LeadCreatedEvent`, `PaymentReceivedEvent`, `GmailMessageReceivedEvent`).
- `src/types/agent.ts` — `AgentId`, `AgentResult`, `ToolCall`, `ToolResult` types.

Every entity type uses `snake_case` columns matching the DB. No `any`. Status enums as `as const` string unions, not generic `string`.

**AC:**
- [ ] `npx tsc --noEmit` clean.
- [ ] No `any`. No non-null assertions without `// safe:` comments.
- [ ] Status fields typed as union literals matching the DB check constraints.

---

### LENS-005 — Token encryption module

**File:** `src/lib/crypto/tokens.ts`

Exports:
```ts
export function encryptToken(plaintext: string): { ciphertext: Buffer; keyVersion: number };
export function decryptToken(ciphertext: Buffer, keyVersion: number): string;
```

- AES-256-GCM via Node `crypto`.
- `TOKEN_ENCRYPTION_KEY` from env, base64-encoded 32 bytes.
- `key_version` returned alongside ciphertext so the DB row stores it. Decrypt looks up the key for that version. **Sprint 2 only supports version 1.** The plumbing for rotation is in place; actual rotation is deferred.
- Zero logging of plaintext or ciphertext. On decrypt failure, throw a typed `TokenDecryptError` — never include the ciphertext in the error message.

**AC:**
- [ ] Round-trip test: `decryptToken(encryptToken("foo")) === "foo"`.
- [ ] Decrypt with wrong key throws `TokenDecryptError`.
- [ ] No plaintext or ciphertext appears in any log line in any code path.

---

### LENS-006 — Domain event bus

**File:** `src/lib/events/bus.ts`

```ts
export function publish<T extends DomainEvent>(event: T): Promise<void>;
export function subscribe<T extends DomainEvent>(
  type: T['type'],
  handler: (event: T) => Promise<void>
): Unsubscribe;
```

- In-memory pub/sub for now. Subscribers are async, awaited sequentially per event (parallel handling later).
- Every published event is also written to a `domain_event_log` table (add via a tiny extra migration or fold into 002 — recommend folding in).
- Type-safe: handler receives the exact event subtype, not `DomainEvent`.

**Defer to later sprints:** durable queue, retry, dead-letter handling. Document the deferral in `docs/architecture/DECISIONS_LOG.md`.

**AC:**
- [ ] Publish/subscribe round-trip test.
- [ ] Handler type is narrowed to the specific event subtype.
- [ ] Every published event row in `domain_event_log` has photographer_id + type + payload.

---

### LENS-007 — Tool registry

**File:** `src/lib/ai/tools/registry.ts`

```ts
export function registerTool<I, O>(spec: {
  name: string;            // 'lens.create_lead', 'gmail.send', ...
  input: z.ZodType<I>;
  output: z.ZodType<O>;
  allowedAgents: AgentId[];
  handler: (input: I, ctx: ToolContext) => Promise<O>;
}): void;

export function getTool(name: string): RegisteredTool | undefined;
export function callTool(
  name: string,
  input: unknown,
  ctx: { agentId: AgentId; photographerId: string }
): Promise<unknown>;
```

- `callTool` validates input via Zod, checks `agentId` is in `allowedAgents`, calls handler, validates output, writes `agent_tool_call_log` row, returns output.
- No tool can be called by an agent not in its `allowedAgents`. Throws `ToolPermissionError`.
- Logs: tool_name, agent_id, photographer_id, input_hash (sha256, not content), output_hash, status, latency_ms. **Never input or output content.**

**Sprint 2 registers ZERO tools.** The registry exists; no agent uses it yet. Sprint 3+ tickets register tools.

**AC:**
- [ ] Permission check: registering a tool with `allowedAgents: ['lead']` and calling with `agentId: 'booking'` throws `ToolPermissionError`.
- [ ] Input/output validation: invalid input throws Zod error; invalid handler return throws.
- [ ] Every successful call writes one `agent_tool_call_log` row.
- [ ] No log line contains tool input or output content.

---

### LENS-008 — Gateway

**File:** `src/lib/ai/gateway.ts`

This is the only file in the codebase allowed to `import Anthropic from '@anthropic-ai/sdk'`. Add a comment at the top stating that. Add an ESLint rule (or grep-based CI check) that fails the build if any other file imports the SDK.

```ts
export async function runAgent(args: {
  agentId: AgentId;
  photographerId: string;
  messages: Message[];
  mode?: 'live' | 'eval';        // 'eval' replays from fixtures, never calls API
  fixtureId?: string;            // required when mode === 'eval'
}): Promise<AgentResult>;
```

Responsibilities:
- Resolve active prompt version via `getActiveVersion(agentId)` (Sprint 3 implements this; Sprint 2 stub returns `'v0-stub'`).
- Resolve allowed tools via the registry.
- Apply retry policy: exponential backoff, max 3 retries, on 429 / 5xx only.
- Structured log per call: `{ agent_id, photographer_id, prompt_version, mode, input_token_count, output_token_count, latency_ms, tool_calls: [tool_name only], status }`. **Never message content. Never tool call arguments.**
- Eval mode: read fixture from `src/lib/ai/evals/fixtures/[fixtureId].json`, return its `expectedOutput`, do NOT call the API.

**Sprint 2 deliverable:** the gateway compiles, a stub agent ID `'test'` can be passed through in eval mode, no live calls happen anywhere. Live mode wired but untested until Sprint 3.

**AC:**
- [ ] Eval-mode round trip works without `ANTHROPIC_API_KEY` set.
- [ ] Live-mode test mocked at the SDK layer (not skipped).
- [ ] CI check fails when `import Anthropic` appears outside `gateway.ts`.
- [ ] Log assertion: zero log lines contain message text or tool arguments.

---

### LENS-009 — Eval harness skeleton

**Files:**
- `src/lib/ai/evals/runner.ts` — runs a list of fixtures through the gateway in eval mode, asserts `actualOutput` matches `expectedOutput` (deep equal for now; richer matchers later).
- `src/lib/ai/evals/fixtures/.gitkeep` — empty.
- `src/lib/ai/evals/types.ts` — `Fixture`, `EvalResult`, `EvalReport`.

Sprint 2 ships the runner with one synthetic fixture (`agentId: 'test'`, hard-coded `expectedOutput`) to prove the wiring. Sprint 3+ adds real fixtures per agent.

**AC:**
- [ ] `npm run evals` exits 0 with one synthetic fixture passing.
- [ ] Fixture matcher reports diff on mismatch (don't just say "failed").

---

### LENS-010 — ERP read/write modules (skeletons)

**Files:**
- `src/lib/erp/lead/index.ts` — exports `createLead`, `getLead`, `qualifyLead`, `convertLeadToClient`. Implementations call Supabase server client; auth check at every entry point. **No tool registration yet** — that's LeadAgent's responsibility in Sprint 3.
- `src/lib/erp/client/index.ts` — `createClient`, `getClient`, `softDeleteClient`.
- `src/lib/erp/booking/index.ts` — `createBooking`, `getBooking`, `assignLocations`, `cancelBooking`. Same-category enforcement via DB trigger; this layer surfaces the error nicely.
- `src/lib/erp/comm-log/index.ts` — `appendCommLog` (insert-only).
- `src/lib/erp/package/index.ts`, `src/lib/erp/location/index.ts` — basic CRUD.

Every function:
- Takes `photographerId` as the first arg, validated against session.
- Returns typed entities from `src/types/erp.ts`.
- Throws typed errors (`NotFoundError`, `ValidationError`, `RLSError`).

**Sprint 2 doesn't wire these to UI.** They're called from tests and from Sprint 3 tools.

**AC:**
- [ ] Each function has at least one passing test that hits a real Supabase test schema.
- [ ] RLS test: calling `getLead` with photographer A's session for photographer B's lead returns null/throws.

---

### LENS-011 — Wire `/clients` page off mocks (bonus, ship if time)

**Goal:** prove the ERP plumbing works end-to-end by replacing `mock/data.ts` for one screen.

**Files touched:**
- `src/app/(dashboard)/clients/page.tsx` — fetch via SWR from a new `/api/clients` route.
- `src/app/api/clients/route.ts` — auth check, calls `getClientsForPhotographer`, returns JSON.

**Out of scope:** `/journey`, `/payments`, every other mocked page. One screen only.

**Move to Sprint 5 if Sprint 2 runs long.** This is the only ticket in Sprint 2 that's "build now or build later" — every other ticket is a hard prerequisite for Sprint 3.

**AC:**
- [ ] `/clients` shows real data when logged in, empty state when no clients exist.
- [ ] No reference to `DATA.clientsList` remains in `clients/page.tsx`.
- [ ] Loading, empty, error states all render (per `personas/PERSONA_UX.md`).

---

### LENS-012 — Update CLAUDE.md and architecture docs

**Files touched:**
- `CLAUDE.md` — Current Build State updated; add `npm run evals` and `npm run typecheck` to dev commands.
- `docs/architecture/AGENT_ARCHITECTURE.md` — fix the LeadAgent tool list (remove `gmail.send` — that's CommsAgent's). Add a "Sprint 2 deliverables" note in the gateway section.
- `docs/architecture/DECISIONS_LOG.md` — log the deferrals: durable event queue, key rotation procedure, multi-version prompt support.

**AC:**
- [ ] No dangling references to non-existent files.
- [ ] LeadAgent tool list is `gmail.read_thread`, `lens.create_lead`, `lens.qualify_lead`. Nothing else.

---

### LENS-013 — RLS verification test suite

**File:** `tests/rls.test.ts`

For every table in migration_001 + migration_002, assert:
1. Authenticated photographer A can `select`/`insert`/`update` their own rows.
2. Authenticated photographer A **cannot** `select`/`insert`/`update` photographer B's rows.
3. Anonymous client receives RLS denial.
4. `comm_log` and `agent_tool_call_log` reject `update` and `delete` for everyone (including row-owner).

This is the test that catches the most expensive class of bug in Lens. Don't skimp.

**AC:**
- [ ] At least 4 assertions per table (read self / read other / write self / write other).
- [ ] Append-only tables additionally test reject-update + reject-delete.
- [ ] Test runs in CI on every PR.

---

### LENS-014 — ESLint / CI guards

Add CI checks (failing the build) for the anti-patterns most likely to be violated this sprint:

- `import Anthropic` outside `src/lib/ai/gateway.ts`.
- `import Stripe`, `import { google }` outside their adapter directories.
- `console.log` in `src/lib/ai/**` or `src/lib/integrations/**`.
- `any` type in `src/types/**`.

Grep-based or ESLint, doesn't matter — make it red in CI.

**AC:**
- [ ] Each guard tested with an intentional violation in a throwaway branch — CI must fail.
- [ ] Guards documented in `ANTI_PATTERNS.md` next to the rules they enforce.

---

## Bottlenecks to Expect

1. **The `booking_location` same-category trigger.** Test it both for inserts and updates. Easy to forget update path.
2. **Token encryption rotation.** You will be tempted to hardcode a single key. Don't. The `key_version` column is cheap; back-filling later is not.
3. **Eval harness feels premature.** It will. Build it anyway. The first time you ship a prompt change without an eval is the day a customer-facing regression makes it to production.
4. **`comm_log` append-only enforcement at the RLS layer.** Easy to write a "view your own rows" policy that accidentally allows updates. Test for the negative case explicitly — that's why LENS-013 is its own ticket.

---

## Leading Metric

**Single number:** number of new tables that pass the full RLS test matrix in LENS-013. Target: 10/10.

Not "PRs merged." Not "tickets closed." If LENS-013 is green, the sprint succeeded. If it's red, nothing else matters.

---

## What Sprint 3 Inherits

- A gateway that compiles and supports both live and eval modes.
- A tool registry that enforces per-agent permissions.
- Encrypted-at-rest token storage with rotation plumbing.
- Every ERP table the cradle uses.
- An RLS test suite that catches future breakage.
- An eval harness ready for its first real fixture.

Sprint 3 then ships LeadAgent end-to-end: Gmail OAuth → Pub/Sub webhook → LeadAgent run → `lead` row + qualification + intent summary, with adversarial evals. None of that is buildable without this sprint.

---

## Cross-References

| Concern | Lives in |
|---|---|
| ERP entity definitions | `docs/architecture/ERP_DATA_MODEL.md` |
| Agent boundaries (LeadAgent tools) | `docs/architecture/AGENT_ARCHITECTURE.md` |
| Encryption posture, RLS rules | `docs/architecture/SECURITY.md` |
| Anti-patterns enforced this sprint | `docs/architecture/ANTI_PATTERNS.md` (rules 1, 2, 3, 6, 8, 11, 21, 24, 28, 29) |
| Naming | `docs/architecture/DOMAIN_GLOSSARY.md` |

---

*Lens | Sprint 2 Spec | Drafted: 2026-05-06 | Owner: Nate Vermylen*
