# LENS-023 — Gmail lead intake: inquiries land in Lens, not in a tab

> Feature spec (DRAFT). Phase 1, Sprint 3+. Branch prefix: `LENS-023-*`.
> **Not started** — pending formal kickoff.
>
> ⚠️ **Coordination with LENS-022e (payment chase, in flight in another
> session):** 022e introduces `vercel.json`, the `CRON_SECRET` env var, the
> first cron route under `src/app/api/cron/`, and touches `CLAUDE.md`,
> `DECISIONS_LOG.md`, `src/lib/erp/invoice/`, and the payments/mission-control
> surfaces. **LENS-023b (the intake runner) reuses all of that cron
> infrastructure and must branch after 022e merges.** 023a (scope + read
> adapter) touches only `google/oauth.ts`, the connect/callback routes, and
> `integrations/gmail/client.ts` — none of which 022e owns — and can start
> immediately after kickoff. Also merge PR #38 (recompute guards) before 023
> touches anything, and verify migration numbering at kickoff: this spec
> assumes `migration_006` is next.

## Why (HABIT_DESIGN)

The morning sweep answers who owes / who's next / what's late — but the
four-tab ritual it replaces has a fourth tab: **Gmail, where new business
arrives.** Today an inquiry lands in Morgan's inbox and stays there; Lens
finds out only if she retypes it. That is the two-system trap in its purest
form — as long as new leads live in Gmail, Gmail keeps its place in the
morning ritual and Lens is the second system.

This ticket makes inquiries **flow into Lens on their own**: a new inquiry
email becomes a `lead` row, LeadAgent qualifies it (the agent is built,
eval-gated, and has been waiting for a production caller since Sprint 2), and
the inquiries page becomes a real surface instead of the last mock-backed
page on the primary path. Speed-to-lead is a revenue behavior — the
photographer who replies first books the shoot — so intake latency is a
feature, not plumbing.

Endowed progress (Rule 3): from the moment Google is connected, every new
inquiry appears in Lens with zero effort. Nothing to import, nothing to
retype — the system starts full and stays full.

## What already exists (substrate — do NOT rebuild)

- **LeadAgent, complete and eval-gated** (`src/lib/ai/agents/lead/`):
  `runLeadAgent(supabase, payload)` takes a pre-parsed `InboundLeadPayload`
  `{source_message_id, photographer_id, display_name, email, phone?, source,
  intent_summary?, received_at}`, dedups via `findLeadBySourceMessage`,
  creates the lead, runs the gateway qualification call, and maps
  qualified/needs_info/rejected → ERP status + domain events. Four fixtures
  cover the decision branches. **Nothing in production calls it.** This
  ticket builds its caller; it does not touch the agent.
- **`lead` table ready for Gmail** (migration_001): `source` CHECK already
  includes `'gmail_inbound'`; `intent_summary`, `qualification_status`,
  `received_at` all exist. Migration_003 added nullable `source_message_id`
  with the partial unique index `(photographer_id, source_message_id)` —
  intake re-processing is idempotent at the schema level (LENS-D-019 closed).
- **Lead ERP module** (`src/lib/erp/lead/`): `createLead` (maps
  `gmail_inbound` → client source `'gmail'`), `findLeadBySourceMessage`,
  `qualifyLead`, `listLeads`, `convertLeadToClient`. All tested.
- **Gmail OAuth + adapter** (LENS-022d / LENS-D-025): combined-consent flow
  with verified granted scopes; `gmail` credential row; `sendEmail` in
  `src/lib/integrations/gmail/client.ts` (the only Gmail-API file, #4).
  **D-025's revisit trigger names this exact ticket:** "Adding a third Google
  scope (e.g., `gmail.readonly` for lead intake) — same flow extends."
- **Cron infrastructure** (LENS-022e, in flight): `vercel.json`, cron route
  pattern with `CRON_SECRET` bearer guard. 023b adds a schedule entry, not a
  new pattern.
- **`comm_log`** accepts `direction='inbound'` + `external_message_id` via
  `appendCommLog` — no inbound writer exists yet; the schema is ready.
- **Domain events**: `gmail.message_received`, `lead.created`,
  `lead.qualified`, `lead.needs_info` all exist in `src/types/events.ts`.
  `gmail.message_received` has never had an emitter or subscriber.
- **Inquiries page** (`src/app/(dashboard)/inquiries/page.tsx`): complete
  mock-driven UI reading `DATA.inquiries` — the target UX; 023c wires it real.
- **Missing:** no inbound Gmail read path (`gmail.readonly` not granted, no
  read functions in the adapter), no webhook/poll trigger, no inbound
  `comm_log` writes, no `thread_id` on `lead` (the registry's threading rule
  assumes it), inquiries UI is mock.

## Design decisions (made here, argued once)

> Log as DECISIONS_LOG entries at implementation time — number them then
> (022e is also adding entries; take the next free numbers, per the
> D-023/024/025 collision-avoidance precedent).

**D1 — Poll on cron, defer Pub/Sub.** `INTEGRATION_REGISTRY` contracts
inbound as "Gmail Push via Pub/Sub → webhook." Real Pub/Sub requires a GCP
topic, a grant to Gmail's push service account, push-endpoint verification,
and webhook auth — a day of console plumbing serving a latency requirement
("instant") that the product doesn't have yet. MVP: a **cron route polling
every 10 minutes** using the 022e pattern (`CRON_SECRET` guard), querying
Gmail for recent inbox messages and running the intake pipeline.
Speed-to-lead at ≤10 minutes beats the incumbent (inquiries sit in Gmail
until Morgan opens it — hours). Statelessness makes this safe: **no sync
cursor at all** — each run queries a rolling window (`in:inbox
newer_than:2d`) and the `(photographer_id, source_message_id)` unique index
plus `findLeadBySourceMessage` make reprocessing a no-op. No cursor to
corrupt, no history-gap recovery logic. Pub/Sub upgrades this to push in a
later ticket without changing the pipeline behind it; amend the registry's
Gmail sync-rules line accordingly in this ticket (the contract doc must match
what ships).

**D2 — Deterministic extraction; the LLM judges, it does not parse.**
`InboundLeadPayload` is built from email **headers**: `display_name` and
`email` from `From:`, `received_at` from `internalDate`, `source_message_id`
from the Gmail message id, `intent_summary` = subject + plain-text body
(truncated ~2k chars). No extraction LLM call — the qualification call
LeadAgent already makes is the only model involvement (same D3 logic as the
chase: parsing is string handling; judgment is the model's job). Bodies flow
into `intent_summary` and `comm_log.body` — the ledger holds content; app
logs get IDs and counts only (#11, ZDR).

**D3 — What counts as a lead candidate.** Only messages that are (a) in the
inbox, (b) **thread-starters** (first message of their thread — replies
belong to conversations, not lead intake), and (c) from a sender whose email
matches **no existing client and no existing lead** for this photographer.
Everything else is skipped *silently by the intake runner* — an existing
client replying about her session is CommsAgent's future territory, not a
lead, and creating junk leads would poison the inquiries surface (Rule 4:
a fabricated lead is a false business event). Spam that passes the
candidate filter is LeadAgent's job to reject (the `spam-rejected` fixture
is exactly this); rejected leads land as `disqualified`, visible under the
inquiries page's non-primary tab, never deleted — honest ledger, no silent
drops.

**D4 — `gmail.readonly` joins the combined consent (D-025 extension).** Add
the scope to `GOOGLE_CONNECT_SCOPES`; same single consent screen, same
dual-row storage, granted union verified from the token response as always.
Granular-consent guard extends per-capability: the `gmail` row's `scope[]`
records what was actually granted, and **intake activates only when
`gmail.readonly` is present** — a send-only grant keeps the chase working
with intake off (surfaced as "connect Gmail reading to capture inquiries",
never a silent no-op). Existing calendar sync and `gmail.send` must work
unchanged after reconnect — acceptance test, not assumption.

**D5 — Every ingested inquiry writes the ledger.** For each message that
becomes a lead: one `comm_log` row (`direction='inbound'`,
`channel='email'`, `lead_id`, `external_message_id`, subject + body) written
**after** `createLead` succeeds (same write-order reasoning as D5/send-then-log:
the ledger records what happened, it is not a lock). `gmail.message_received`
is emitted per ingested message — the event exists; intake is its first
emitter. Migration_006 adds nullable `lead.thread_id` (the registry threading
rule assumes it; replies to the thread are how CommsAgent will join the
conversation later).

## Sub-PRs (build in order)

---

### LENS-023a — `gmail.readonly` scope + read adapter

Can start immediately after kickoff (no 022e files).

- `GOOGLE_CONNECT_SCOPES` += `https://www.googleapis.com/auth/gmail.readonly`
  (D4 / D-025 revisit). `resolveGrantedServices` and the callback's granular
  guard extended so the `gmail` row's `scope[]` stays honest; partial grants
  (send without readonly) keep the chase alive and intake off.
- `src/lib/integrations/gmail/client.ts` gains read functions (still the only
  Gmail-API file): `listInboxMessageIds({newerThanDays, maxResults})` (Gmail
  `users.messages.list` with `q='in:inbox newer_than:Nd'`) and
  `getMessage({id})` returning a clean internal shape `{message_id,
  thread_id, from_name, from_email, subject, body_text, received_at,
  is_thread_start}` — headers parsed here, Zod at the boundary, base64url
  body decoding, text/plain part preferred with HTML-strip fallback.
- Same error contract as `sendEmail`: 429 backoff max 3, 401/revoked →
  `integration_auth_error`.
- **Security-sensitive → tests in the same PR** (#33 standing rule): scope
  resolution matrix (send-only / readonly-only / both / neither), header
  parsing (RFC 2047 subjects, `Name <addr>` and bare-address From), body
  decode, and the no-tokens-no-bodies-logged assertion.
- Registry doc: Gmail section ship-status updated (readonly live, Pub/Sub
  still pending; sync-rules line amended per D1).

### LENS-023b — intake runner + cron (branch after 022e merges)

- `migration_006_lead_thread_id.sql` — nullable `lead.thread_id text` +
  partial index; SQL only, applied manually to prod + test (#1).
- `src/lib/erp/lead/intake.ts` — `runGmailLeadIntake(supabase,
  photographerId)`: list recent inbox messages → filter to candidates (D3:
  thread-start + unknown sender; one query each against client/lead emails)
  → for each: `findLeadBySourceMessage` dedup → build `InboundLeadPayload`
  (D2) → `runLeadAgent` → `appendCommLog` inbound row + emit
  `gmail.message_received` (D5). Returns counts `{seen, candidates, created,
  duplicates, skipped}` for the cron log — counts and IDs only, never
  content.
- `src/app/api/cron/gmail-lead-intake/route.ts` + a `*/10` schedule entry in
  `vercel.json` (022e's file — append, don't restructure). `CRON_SECRET`
  bearer guard, same as the chase route.
- Failure honesty: missing/revoked `gmail.readonly` → skip with a surfaced
  "inquiry capture paused — reconnect Google" state (dashboard integration
  status), never a silent stop; per-message failures skip that message and
  continue the batch (one malformed email must not stall intake).
- Tests: candidate filter (reply vs thread-start, known client, known lead),
  dedup no-op on second run over the same window, payload construction from
  parsed messages, ledger write ordering, revoked-scope surfacing.

### LENS-023c — inquiries page goes real

- Wire `src/app/(dashboard)/inquiries/page.tsx` to `listLeads` (delete
  `DATA.inquiries` from the mock file); tabs by `qualification_status`, new
  + needs-info first — the "answer first, act second" ordering.
- `needs_info` leads show their `missing_fields` (the agent already produces
  them) — what to ask when she replies.
- Dashboard: inquiries KPI wired real if the strip has it; **no push/email
  notifications** — a new lead appears in the morning sweep and on the
  inquiries page; that is the notification (Rule 5: the sweep is the
  surface; anything louder is an engagement nudge until proven otherwise).
- Honest states: Gmail-not-connected → connect prompt (the 021d pattern);
  connected-but-zero-inquiries → "watching your inbox — inquiries appear
  here" with last-checked time, never a fake empty table.

### Deferred (explicitly not this ticket)

- Pub/Sub push (D1) — later latency upgrade, pipeline unchanged.
- `gmail.read_thread` / `gmail.search` as registered agent tools — LeadAgent
  works from the payload today; tools land with the CommsAgent/reply ticket.
- Auto-reply / speed-to-lead drafts (CommsAgent territory; needs owner
  approval flow).
- Attachment handling, HTML-rich parsing beyond text extraction.
- Backfill of historical inbox (cutover imports leads via CSV already;
  intake is forward-looking from connect).

## Accuracy is a release gate (Rule 4)

A fabricated or duplicated lead is a false business event on the primary
surface; a silently dropped inquiry is worse — it is the exact failure Gmail
never has (mail doesn't vanish). Before release: run intake twice over the
same window on the test account → zero duplicates; send test inquiries
(new sender, existing client reply, spam-shaped) → exactly the right ones
become leads; revoke `gmail.readonly` → the paused state surfaces within one
cron cycle. The inquiries page count must reconcile with `lead` rows exactly.

## Habit check (PM persona — against all seven rules)

**Rule 1 (one-screen sweep):** inquiries feed the existing surfaces; no new
morning destination. **Rule 2 (cutover):** kills the Gmail-as-lead-tracker
tab — the last daily reason Gmail owns her morning. **Rule 3 (never open
empty):** intake fills the page on its own; connect-state and
watching-state are honest, never blank. **Rule 4 (accuracy P0):** dedup at
the schema level, candidate filter biased against fabrication, release gate
above. **Rule 5 (notification discipline):** zero pushes; the sweep is the
notification. **Rule 6 (no gamification):** a lead count is a queue, not a
score; no celebration on qualification. **Rule 7 (investment compounds):**
every captured lead seeds the funnel (lead → booking → invoice → chase) —
each prior ticket's machinery makes this one's output more valuable.

## Gates (every sub-PR)

- `npx tsc --noEmit` + `npm run lint` + `npm run check:error-handling` clean.
- Gmail SDK/API only inside `src/lib/integrations/gmail/` (#4); LLM calls
  only via the gateway (#3); Zod at every API/tool boundary; auth or
  `CRON_SECRET` guard atop every route.
- OAuth/scope changes ship tests in the same PR (#33); no tokens, prompt
  content, or email bodies in app logs (#11).
- Migrations: SQL only, never executed (#1); applied to prod + test before
  dependent code merges.
- `data-testid` on all interactive elements; no hardcoded model strings (#8).
- DECISIONS_LOG entries match shipped behavior; registry amended where the
  contract changes (D1).
- Habit check per sub-PR (PM persona owns it).
