# ANTI_PATTERNS
## Lens — Never Do This (And Why)

> **Purpose**: Implementation mistakes Lens is prone to and patterns that have caused bugs or rework. Claude Code reads this at `/init`. When you see yourself about to do any of these, stop.
>
> **How to maintain**: Add entries when a bug traces back to a pattern mistake, when a PR is rejected for a recurring reason, or when an architectural constraint gets violated for the second time. Each entry must explain *why* — not just what.

---

## Category 1: Database & Migrations

### ❌ 1. Running migrations via Claude Code
**What:** Using Claude Code to execute `psql`, Supabase CLI `db push`, or any migration runner.
**Why:** Migrations modify production schema. A mistake is unrecoverable without a restore. Human eyes verify SQL before it touches a live database.
**Instead:** Generate `.sql` files in `migrations/`. Apply manually in Supabase dashboard. Update CLAUDE.md migration number after applying.

### ❌ 2. Tables without RLS
**What:** Creating a table without `ALTER TABLE [table] ENABLE ROW LEVEL SECURITY` and at least one policy.
**Why:** Supabase tables with RLS disabled are readable/writable by any authenticated user. One missing RLS policy = all photographers see all photographers' data.
**Instead:** Every migration that creates a table includes RLS + a photographer-scoped policy. See `docs/personas/PERSONA_ARCH.md`.

### ❌ 3. Missing indexes on FK and filter columns
**What:** Creating FK columns or frequently-filtered columns without indexes.
**Why:** At N+ rows, an unindexed FK join or `WHERE photographer_id = …` becomes a full table scan. Doesn't hurt in development — destroys production.
**Instead:** Every FK column gets an index. Every column in `WHERE`, `ORDER BY`, or join conditions gets an index. Add them in the same migration.

### ❌ 4. Hard deletes on user data
**What:** `DELETE FROM [table] WHERE id = $1` on tables with user-generated data.
**Why:** Unrecoverable. May violate audit requirements. Breaks FK references unless cascades are exact.
**Instead:** Soft deletes via `deleted_at timestamptz`. Filter with `.is('deleted_at', null)`. Build a separate purge process if compliance requires.

### ❌ 5. Renaming columns in production migrations
**What:** `ALTER TABLE [table] RENAME COLUMN [old] TO [new]`.
**Why:** PostgREST caches schema. Application code referencing the old name breaks before the deploy lands. The window is short but real.
**Instead:** Add new column → backfill → update app code → deprecate (not rename) the old column in a later migration.

---

## Category 2: Authentication & Security

### ❌ 6. Trusting client-supplied user IDs
**What:** Using `body.userId` or `params.userId` to scope a query.
**Why:** Any user can send any value. This is the #1 source of IDOR vulnerabilities.
**Instead:** Always derive the photographer ID from `supabase.auth.getUser()` server-side.

### ❌ 7. Using the service role client for user-scoped operations
**What:** Importing `admin.ts` (service role) in API routes that serve regular photographer requests.
**Why:** Service role bypasses RLS. Application bugs become data leaks.
**Instead:** `server.ts` for all photographer-facing routes. `admin.ts` only for legitimate cross-photographer operations (rare).

### ❌ 8. `NEXT_PUBLIC_` prefix on secret variables
**What:** Naming a secret env var `NEXT_PUBLIC_*`.
**Why:** `NEXT_PUBLIC_` variables ship to the client bundle and appear in DevTools.
**Instead:** Server-only secrets have no `NEXT_PUBLIC_` prefix. Access only in API routes and server components.

### ❌ 9. Skipping auth checks on "internal" API routes
**What:** Omitting `auth.getUser()` on a route considered "internal."
**Why:** All API routes are publicly reachable. There is no network-level restriction unless explicitly added.
**Instead:** Every API route mutating photographer-scoped data starts with an auth check. Webhooks are the only exception — they verify signatures.

### ❌ 10. Logging Tier 1 / Tier 2 data
**What:** `console.log` with email, name, address, phone, OAuth token, prompt content, AI response content.
**Why:** Logs are persistent and often shipped to third-party log services. Tier 1/2 leakage is exactly what `SECURITY.md` exists to prevent.
**Instead:** Log photographer ID, entity ID, status — never the data itself. See `SECURITY.md` for tier definitions.

---

## Category 3: TypeScript & Code Hygiene

### ❌ 11. `any` type
**What:** `const data: any = ...`, `function process(input: any)`, `as any`.
**Why:** Defeats TypeScript. Errors that would have caught at compile time become runtime bugs. `any` propagates through a codebase.
**Instead:** Type explicitly. Use `unknown` and narrow if the shape is genuinely uncertain. Define an interface even if imperfect.

### ❌ 12. Non-null assertion without justification
**What:** `const user = maybeUser!` with no comment.
**Why:** `!` says "trust me." If wrong, runtime crash. CC uses `!` to skip null handling — always wrong.
**Instead:** Handle null explicitly. If `!` is genuinely safe, add `// safe: [reason]`.

### ❌ 13. Skipping `npx tsc --noEmit` before commit
**What:** Committing without compiler check.
**Why:** ESLint and tsc catch different things. CC sometimes generates code that lints clean but has type errors.
**Instead:** Run `npx tsc --noEmit` before every commit. Pre-commit hook enforces this.

### ❌ 14. `console.log` in production paths
**What:** Debug logging left in code.
**Why:** Pollutes logs, can leak data, signals incomplete cleanup.
**Instead:** Use the structured logger. Remove debug logs before commit. CI greps for them.

### ❌ 15. Hardcoded strings in UI
**What:** Error messages, button labels, toast text duplicated across components.
**Why:** Inconsistent copy is a UX smell. Copy changes require grep-and-replace.
**Instead:** Constants for repeated copy. Toast utility for standard phrasing. See `DESIGN_SYSTEM.md`.

---

## Category 4: React & Frontend

### ❌ 16. `useEffect` for data fetching
**What:** `useEffect(() => { fetch('/api/...').then(...) }, [])`.
**Why:** Doesn't handle loading, race conditions, caching, revalidation, or deduplication. Always produces bugs SWR would have prevented.
**Instead:** SWR for client-side. Server components for initial page data.

### ❌ 17. Direct Supabase calls from components
**What:** `import { supabase } from '@/lib/supabase/client'` in a React component, then querying directly.
**Why:** Bypasses the API layer and any server-side validation. Untestable. RLS is the only protection.
**Instead:** Components call API routes. API routes query Supabase with server-side auth.

### ❌ 18. Business logic in React components
**What:** Complex transformation, calculation, or business rules inside component functions.
**Why:** Untestable, unreusable. CC copies the logic into the next component instead of reusing.
**Instead:** Extract to `lib/erp/[entity]/`. Pure functions with explicit inputs/outputs.

### ❌ 19. Missing loading / empty / error states
**What:** Component renders only the happy path.
**Why:** Production data is sometimes slow, sometimes empty, sometimes failed. Missing states = blank screens or layout breaks.
**Instead:** Every data-driven component renders loading, empty, error, populated. See `docs/personas/PERSONA_UX.md`.

### ❌ 20. Selecting elements by CSS class or text in tests
**What:** `page.locator('.submit-button')` or `page.getByText('Submit')`.
**Why:** Class names change with refactors. Text changes with copy. Tests break for non-functional reasons.
**Instead:** `data-testid` always. ARIA role+name as fallback.

---

## Category 5: Agent / LLM (Lens-Specific)

### ❌ 21. Importing the LLM SDK outside `gateway.ts`
**What:** `import Anthropic from '@anthropic-ai/sdk'` anywhere except `src/lib/ai/gateway.ts`.
**Why:** Without a single gateway, prompt versions drift, retry logic duplicates, eval mode breaks, logging diverges. The gateway exists specifically to centralize this concern.
**Instead:** Call agents via their `run.ts` exports. Agents call the gateway. The gateway calls the SDK.

### ❌ 22. Hardcoded prompt strings inside agent files
**What:** A string literal containing prompt content inline in `run.ts` or `tools.ts`.
**Why:** Defeats prompt versioning. A prompt change ships without an eval run. Regressions appear in production with no rollback path.
**Instead:** Prompts live as typed constants in `src/lib/ai/agents/[agent]/prompts/system.v[N].ts`. Loaded via `getActiveVersion()`.

### ❌ 23. Shipping a prompt change without re-running per-agent evals
**What:** Bumping a prompt version, deploying, no eval suite ran.
**Why:** The whole point of versioned prompts + evals is to catch regression. Skipping the eval surrenders that protection.
**Instead:** Promotion gate: a new active version requires the per-agent eval suite to pass. CI enforces.

### ❌ 24. Adding an agent tool without registering it
**What:** A new function called from agent code that isn't in `src/lib/ai/tools/registry.ts`.
**Why:** Tool calls bypass the registry's input/output validation, logging, and permission checks.
**Instead:** Every tool is registered with Zod schemas. Every agent's `tools.ts` declares its allowed-set.

### ❌ 25. Agent A calling Agent B directly
**What:** `import { runBillingAgent } from '../billing/run'` inside `BookingAgent`.
**Why:** Couples agents. Makes eval-in-isolation impossible. Turns the agent layer into a service mesh.
**Instead:** Cross-agent coordination via ERP-mediated state or domain events. See `AGENT_ARCHITECTURE.md` § Multi-Agent Coordination.

### ❌ 26. Agent writing to an integration without writing to ERP first
**What:** `gmail.send(...)` then no `comm_log` row written.
**Why:** ERP is source of truth. If the integration write succeeds and the ERP write fails (or never happens), state diverges.
**Instead:** Write to ERP first, then call the integration tool. The gateway can sequence this if the tool supports it.

### ❌ 27. Cross-agent reads via direct DB query
**What:** BookingAgent doing `select * from expense where ...`.
**Why:** Bypasses the ERP read API, breaks agent boundaries, makes refactoring entity ownership painful.
**Instead:** ERP read functions in `lib/erp/[entity]/` are the cross-agent contract. Use those.

### ❌ 28. Logging prompt content or LLM response content
**What:** `logger.info({ prompt: ... })` or `console.log(response.content)`.
**Why:** ZDR posture. Prompts and responses can contain Tier 1/2 data. Token counts only.
**Instead:** Log token counts, latency, tool names called, prompt version, agent ID — never the strings.

---

## Category 6: Integrations (Lens-Specific)

### ❌ 29. Importing an integration's SDK outside its adapter
**What:** `import Stripe from 'stripe'` anywhere outside `src/lib/integrations/stripe/`.
**Why:** Same reason as the LLM SDK — centralization. The adapter encapsulates auth, retry, error mapping. Bypassing it duplicates all that.
**Instead:** Call adapter-exported tools via the gateway tool registry.

### ❌ 30. Webhook handlers writing directly to Supabase
**What:** A Stripe webhook handler that does `supabase.from('payment').insert(...)` itself.
**Why:** Bypasses the agent layer that owns reconciliation logic. Webhooks should dispatch domain events; agents handle them.
**Instead:** Webhook validates signature → emits `payment.received` event → BillingAgent processes.

### ❌ 31. Storing OAuth tokens unencrypted
**What:** `integration_credentials.access_token` written as plaintext.
**Why:** Database breach = full integration takeover for every photographer.
**Instead:** Encrypt at rest using `lib/crypto/tokens.ts`. See `SECURITY.md`.

### ❌ 32. Skipping webhook signature verification
**What:** Trusting that a webhook payload is from the claimed sender.
**Why:** Webhook endpoints are publicly reachable. Without signature verification, anyone can forge a payment notification.
**Instead:** Every adapter's `webhooks.ts` validates signature first; invalid → 401, log security event.

---

## Category 7: Claude Code Execution

### ❌ 33. Shipping security/crypto code without tests in the same PR
**What:** A module touching encryption, auth, token handling, or credential storage is merged without a co-located test file.
**Why:** Security code is binary — it either works or it's a vulnerability. "Follow-up ticket for tests" means the code ships unverified. The Sprint 2 spec required three test ACs for LENS-005; they weren't written. This rule prevents recurrence.
**Instead:** Security/crypto modules and any ticket with explicit test acceptance criteria must include the test file in the same PR. The PR is incomplete without it.

### ❌ 34. Proceeding past a foundational decision without flagging it
**What:** CC makes an architectural call (PK type, API contract shape, agent boundary) without surfacing it.
**Why:** Small foundational decisions have huge downstream consequences. Wrong PK type in PR 1 = painful migration in PR 6.
**Instead:** When CC hits a decision not covered by the spec, stop. State the options and tradeoffs. Don't guess on foundations.

### ❌ 35. Implementing scope not in the spec
**What:** "While I'm here" additions — extra fields, additional endpoints, UI improvements not specified.
**Why:** Scope creep from inside CC inflates PRs, ships untested code, and shifts the implementation away from the spec QA validates.
**Instead:** Implement exactly the spec. Log out-of-scope observations as `// TODO: LENS-NNN — [observation]`.

### ❌ 36. Not reading existing files before writing new ones
**What:** Writing `lib/foo.ts` without reading `lib/bar.ts` to learn the pattern.
**Why:** Duplicate utilities, inconsistent patterns, broken imports. The 20th file in a codebase must look like the first.
**Instead:** Read the most similar existing file before writing any new one. Match imports, error patterns, return-type conventions.

### ❌ 37. Ignoring `{ error }` from Supabase calls
**What:** Calling `supabase.from(...).insert(...)` (or update/delete) without checking the returned `{ error }` field, or using `.then(...)` / `await` and dropping the result.
**Why:** Supabase doesn't throw on RLS denials or transient DB errors. It returns `{ data, error }`. Ignoring `error` means failures are silent. The audit log gets gaps. Webhook handlers silently fail. State diverges.
**Instead:** Always destructure `{ error }`. Either throw (when the call's purpose fails without it) or `console.error` and continue (when the call is best-effort, like an audit log). Decide which posture per call site, document the choice in a code comment.

---

## Maintenance Log

| Date | Entry Added | Reason |
|------|-------------|--------|
| 2026-05-09 | #37 | Recurring PR rejection — LENS-006 (event bus) and LENS-007 (tool registry) both shipped Supabase writes without checking `{ error }` |

---

*Lens | Anti-Patterns | Last updated: 2026-05-09*
