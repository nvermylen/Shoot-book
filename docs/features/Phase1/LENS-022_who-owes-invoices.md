# LENS-022 — "Who owes me" / invoices, payments, and the payment chase

> Feature spec (DRAFT). Phase 1, Sprint 3+. Branch prefix: `LENS-022-*`.
> **Not started** — pending formal kickoff. Third pillar of the morning sweep,
> decomposed into sub-PRs below; build in dependency order.
>
> ⚠️ **Coordination with LENS-021 (mid-flight in another session):** LENS-021c/d
> touch `src/lib/erp/booking/`, `src/lib/integrations/calendar/`,
> `src/app/(dashboard)/mission-control.tsx`, `page.tsx`, and
> `migration_004_booking_calendar_sync.sql`. Do not touch those files until
> LENS-021 merges. LENS-022a/b are independent of 021 and can start immediately;
> **LENS-022c (dashboard) and 022e (chase) must branch after 021 merges.**
> Verify migration numbering at kickoff: this spec assumes `migration_005` is
> next (004 is in flight). If anything else lands first, renumber.

## Why (HABIT_DESIGN)

The morning sweep answers three questions: **who owes / who's next / what's
late.** LENS-019/020 made "who" real; LENS-021 makes "who's next" real. This
ticket makes **"who owes me" and "what's late"** real — the money half of the
sweep, and per the persona the half that costs Morgan actual money and actual
stress today.

This is also **the product wedge.** From `persona-end-user.md`:

> *"A client books, pays a deposit, and then owes the remainder before their
> session. I set up a payment reminder. It goes out once, maybe twice. If they
> don't pay, nothing happens. I have to catch it manually. I've been two days
> out from a shoot and just realized someone hasn't paid. … I want the system
> to chase them until they pay. Every 24 hours. Escalating message. Stops the
> second money hits."*

> *"My clients are mostly teenage girls booking senior shoots. They book. Their
> moms pay. … The payment reminder goes to the teenager. She ignores it. The
> mom — the one with the credit card — never sees it."*

No incumbent does both of these. A chase that escalates daily, routes to the
parent who actually pays, and stops the second money hits is the single
strongest cutover lever we have (HABIT_DESIGN two-system trap): once the money
sweep is accurate in Lens and the chasing runs itself, both the Stripe tab and
the "did everyone pay?" spreadsheet lose their daily reason to exist.

**Stripe is Phase 2** (`INTEGRATION_REGISTRY`). This ticket deliberately does
not wait for it: the MVP data source is **manual invoice entry at cutover** and
manual payment recording (cash / check / "paid me on Venmo"). The schema built
here is the same schema Stripe will reconcile into later — the Stripe columns
(`stripe_payment_link_url`, `stripe_payment_intent_id`, `payment.stripe_charge_id`)
ship now, empty, so Phase 2 is additive.

## What already exists (substrate — do NOT rebuild)

- **`client.parent_email` / `parent_name` / `parent_phone`** — shipped in
  LENS-020 with drawer capture UI. Billing routing reads these; nothing new to
  collect.
- **`booking` table** — has `deposit_invoice_id` and `final_invoice_id`, but as
  **`text` columns** (migration_002 created them before the invoice table
  existed). Migration_005 converts them to uuid FKs — see 022a.
- **`comm_sequence` + `comm_sequence_state` tables** (migration_002) — sequence
  templates with `steps jsonb` + per-client progression state. The chase engine
  reuses these; no new sequence tables.
- **`comm_log`** (append-only, no UPDATE policy) — every reminder sent is a row
  here. Gains a nullable `invoice_id` in 022a so chase history is derivable
  from the ledger itself.
- **Domain event bus** (`src/lib/events/bus.ts`) — `payment.received` is
  already in the `DomainEvent` union (`src/types/events.ts:92`) with
  `stripe_payment_intent_id: string | null`, so it fits manual payments as-is.
  `invoice.*` events are new (022b).
- **ERP module pattern** — `src/lib/erp/[entity]/index.ts` returning
  `ErpResult<T>`, write-then-publish with `warning` on event failure. Copy the
  shape of `src/lib/erp/client/`.
- **Payments page** — `src/app/(dashboard)/payments/page.tsx` is a complete
  mock-driven UI (`DATA.payments` in `src/lib/mock/data.ts`): outstanding /
  overdue / paid-MTD stats, invoice table with parent-routing column, reminder
  rules panel. The mock's shape (`routing: "parent" | "client"`, `reminders`
  count, escalation rules) is the target UX — 022b wires it real.
- **Dashboard** — `DashboardKpis.outstanding` exists and is honestly `null`
  today (`page.tsx:70`); `mission-control.tsx` renders "—" and carries explicit
  `LENS-022` TODOs at lines 18–19 and 216–217 saying the who's-next card must
  never fabricate a payment pill. 022c pays off those TODOs.
- **Google OAuth + encrypted token storage** (LENS-021a) —
  `integration_credentials` with AES-256-GCM ciphertext, `crypto/tokens.ts`
  (tested), refresh-on-expiry wiring (021b). The `service` CHECK already
  includes `'gmail'`. 022d extends this; it does not rebuild it.
- **Missing:** no `invoice` or `payment` table (described in
  `ERP_DATA_MODEL.md` but **no migration exists** — the doc is intent, not
  implementation). No `src/lib/erp/invoice/`. No Gmail adapter
  (`src/lib/integrations/gmail/` does not exist). No cron infrastructure (no
  `vercel.json`).

## Design decisions (made here, argued once)

> D1–D5 reviewed and **approved by owner 2026-07-05**. D6 added on that review.

**D1 — `overdue` is derived, never stored.** `ERP_DATA_MODEL.md` lists
`'overdue'` in the invoice status enum. Storing it requires a job to flip
statuses on time, and a job that lags produces exactly the failure Rule 4
forbids: an overdue invoice confidently shown as merely "sent" in the morning
sweep. Instead the stored enum is `'draft' | 'sent' | 'partial' | 'paid' |
'cancelled'`, and **overdue = `status IN ('sent','partial') AND due_date <
today` computed at read time** (in the photographer's timezone). It cannot be
stale because it is never cached. The ERP module exposes it as a derived field;
the proposed `ERP_DATA_MODEL.md` edit below records this.

**D2 — chase state lives in `comm_log`, not a new table.** Consistent with
event-trail-as-versioning (no version columns; the log is the history): the
chase engine derives "what have I already sent for this invoice" from
`comm_log` rows tagged with the new `invoice_id` column. No
`invoice_chase_state` table. Reminder count on the payments page = a count over
`comm_log`. `comm_sequence_state` tracks only pause/cancel intent (see 022e).

**D3 — the chase engine is deterministic code, not an LLM loop.** Escalating
templated reminders on a schedule with hard stop conditions is exactly the kind
of logic that must never be probabilistic — a hallucinated dollar amount in a
payment email is a trust-ending event. It lives in BillingAgent's *territory*
(files under `src/lib/erp/invoice/` + a runner), coordinates ERP-mediated per
`AGENT_ARCHITECTURE` (reads invoice state, writes comm_log — no agent-to-agent
calls), and the Phase-2 BillingAgent LLM loop later drives *judgment* calls
(reconciliation, unusual replies) on top of this same substrate. Template
merge-field rendering is string substitution, not generation.

**D4 — manual invoices are born `'sent'`.** Pre-Stripe, "creating an invoice"
in Lens means "I have already asked for this money" (Morgan enters her open
book at cutover). Manual entry sets `status='sent'`, `sent_at=now()` (editable).
`'draft'` remains in the enum for Phase-2 agent-created invoices awaiting
approval; the MVP UI never produces it.

**D5 — send-then-log for reminders.** The Gmail registry's write-ahead
(`comm_log` row before the API call, marked failed after) conflicts with
comm_log's append-only/no-UPDATE policy for this use case, and a log row
claiming a reminder went out when it didn't makes the engine silently skip a
day — an accuracy lie. The chase engine sends first, logs on success. Failure
mode accepted: if the log write fails after a successful send, worst case is
one duplicate reminder the next day — bounded, and better than a silent stop.
Record this in `DECISIONS_LOG` when implementing (code and decision must agree).

**D6 — one combined-scope Google consent, encrypted tokens upserted onto BOTH
the `'calendar'` and `'gmail'` rows.** Adding `gmail.send` re-runs the 021a
consent flow requesting **both scopes** (`calendar` read scope +
`gmail.send`), with `prompt=consent` + `include_granted_scopes=true`. The
callback **overwrites** the existing `'calendar'` row with the new token pair
and **upserts** a `'gmail'` row with the same ciphertext. Not a second,
independent connect flow, and never a gmail-only consent that supersedes the
calendar grant.

*Why this and not a separate per-service grant:* the registry contract is
explicit — Gmail and Calendar share "same Google identity — single consent,"
and Morgan should see one "Connect Google" action, not two. A gmail-only
re-consent also risks the exact regression this decision exists to prevent:
a flow that leaves the stored calendar credential stale or (via granular
consent) drops the calendar grant while LENS-021 sync depends on it. With
one combined grant: each service lookup (`unique(photographer_id, service)`)
keeps working unchanged; each row is self-sufficient for 021b's
refresh-on-expiry (Google refresh tokens are multi-use and not rotated on
use, so the duplicated refresh-token ciphertext stays valid on both rows even
as their access tokens refresh independently). The duplication cost is two
rows sharing one underlying grant — acceptable, and honest as long as each
row's `scope[]` records the **actually granted union**, verified from the
token response's `scope` field, never assumed from what was requested.

*Granular-consent guard:* Google lets the user uncheck individual scopes on
the consent screen. The callback must check the granted scopes before
writing: gmail.send missing → don't create/claim the `'gmail'` row, surface
"Gmail sending not granted — reconnect to enable payment reminders"; calendar
scope missing → keep the previous calendar credential intact rather than
overwriting it with a narrower grant. A row must never claim a scope its
token lacks (that lie surfaces days later as a mid-chase 403).

*Disconnect semantics (document, don't build):* Google revocation is
grant-level — revoking the token kills **both** services. A future
per-service "disconnect" UI must warn accordingly; deleting one row locally
does not revoke anything at Google.

## Sub-PRs (build in order)

---

### LENS-022a — migration_005: invoice + payment schema

SQL file only (`supabase/migrations/migration_005_invoice_payment.sql`) —
generated, never executed (ANTI_PATTERNS #1); applied manually to **both**
Supabase projects (prod + test) per the test-topology rules.

**Precondition to verify before writing the final file:** confirm
`booking.deposit_invoice_id` / `final_invoice_id` are all NULL in both
environments (`select count(*) from booking where deposit_invoice_id is not
null or final_invoice_id is not null;` — expected 0; no invoice feature has
ever written them). The text→uuid conversion below assumes it.

Draft SQL (implementer: re-verify against migration_002/004 conventions —
`set_updated_at()` trigger function already exists):

```sql
-- Migration: 005 | invoice and payment tables ("who owes") | 2026-07-05
--
-- LENS-022a: the money half of the morning sweep.
--
-- 1) invoice + payment tables per ERP_DATA_MODEL, with one deliberate
--    divergence: no 'overdue' in the stored status enum. Overdue is DERIVED
--    at read time (due_date < today while sent/partial) so the sweep can
--    never show a stale status (HABIT_DESIGN Rule 4). ERP_DATA_MODEL.md is
--    updated in the same PR to record this.
--
-- 2) booking.deposit_invoice_id / final_invoice_id were created as text in
--    migration_002 (invoice table didn't exist yet). Both are NULL for every
--    row in prod and test (verified before applying). Converted to uuid FKs.
--
-- 3) comm_log gains nullable invoice_id: payment reminders are logged
--    against the invoice they chase, and chase state (what was already
--    sent) is derived from the append-only log — no separate state table.

-- ============================================================
-- invoice
-- ============================================================
create table invoice (
  id uuid primary key default gen_random_uuid(),
  photographer_id uuid not null references photographer(id) on delete cascade,
  booking_id uuid not null references booking(id),
  client_id uuid not null references client(id),
  amount_cents int not null check (amount_cents > 0),
  kind text not null check (kind in ('deposit', 'final', 'addon', 'refund')),
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'partial', 'paid', 'cancelled')),
  due_date date not null,
  recipient_email text not null,
  stripe_payment_link_url text,
  stripe_payment_intent_id text,
  quickbooks_invoice_id text,
  sent_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table invoice enable row level security;

create policy "Photographers can view their own invoices"
  on invoice for select
  using (photographer_id = auth.uid());

create policy "Photographers can insert their own invoices"
  on invoice for insert
  with check (photographer_id = auth.uid());

create policy "Photographers can update their own invoices"
  on invoice for update
  using (photographer_id = auth.uid())
  with check (photographer_id = auth.uid());

create policy "Photographers can delete their own invoices"
  on invoice for delete
  using (photographer_id = auth.uid());

create index invoice_photographer_id_idx on invoice(photographer_id);
create index invoice_booking_id_idx on invoice(booking_id);
create index invoice_client_id_idx on invoice(client_id);

-- The morning-sweep query: open money, ordered by due date. Partial index
-- keeps it fast at any invoice volume.
create index invoice_open_sweep_idx
  on invoice(photographer_id, due_date)
  where status in ('sent', 'partial') and deleted_at is null;

create trigger invoice_updated_at
  before update on invoice
  for each row execute function set_updated_at();

-- ============================================================
-- payment
-- ============================================================
create table payment (
  id uuid primary key default gen_random_uuid(),
  photographer_id uuid not null references photographer(id) on delete cascade,
  invoice_id uuid not null references invoice(id),
  amount_cents int not null check (amount_cents > 0),
  method text not null check (method in ('stripe', 'cash', 'check', 'other')),
  stripe_charge_id text,
  received_at timestamptz not null default now(),
  reconciled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table payment enable row level security;

create policy "Photographers can view their own payments"
  on payment for select
  using (photographer_id = auth.uid());

create policy "Photographers can insert their own payments"
  on payment for insert
  with check (photographer_id = auth.uid());

create policy "Photographers can update their own payments"
  on payment for update
  using (photographer_id = auth.uid())
  with check (photographer_id = auth.uid());

-- Delete allowed at RLS level for manual-entry corrections (Morgan fat-
-- fingers a check amount). The ERP layer is the gate: once Stripe lands,
-- stripe-sourced payments must refuse deletion in code.
create policy "Photographers can delete their own payments"
  on payment for delete
  using (photographer_id = auth.uid());

create index payment_photographer_id_idx on payment(photographer_id);
create index payment_invoice_id_idx on payment(invoice_id);

create trigger payment_updated_at
  before update on payment
  for each row execute function set_updated_at();

-- ============================================================
-- booking: convert text invoice refs (migration_002) to real FKs
-- ============================================================
alter table booking
  alter column deposit_invoice_id type uuid using deposit_invoice_id::uuid,
  alter column final_invoice_id type uuid using final_invoice_id::uuid;

alter table booking
  add constraint booking_deposit_invoice_id_fkey
    foreign key (deposit_invoice_id) references invoice(id),
  add constraint booking_final_invoice_id_fkey
    foreign key (final_invoice_id) references invoice(id);

-- ============================================================
-- comm_log: reminders are logged against the invoice they chase
-- ============================================================
alter table comm_log add column invoice_id uuid references invoice(id);

create index comm_log_invoice_id_idx on comm_log(invoice_id)
  where invoice_id is not null;
```

Notes:
- `payment` has **no `deleted_at`** — matches `ERP_DATA_MODEL.md`; corrections
  are hard deletes (manual MVP) and Phase-2 Stripe rows become undeletable in
  the ERP layer.
- `amount_cents > 0` on both tables. A `kind='refund'` invoice carries a
  positive amount (direction is the kind); refund *flows* are Phase-2 Stripe
  scope and out of scope here.
- RLS run of the standard four photographer-scoped policies on every new
  table, in the same migration (CLAUDE.md Migration Rule 4). The RLS test
  suite (`npm run test:rls`) gains invoice + payment isolation cases —
  same PR as the first code that reads them (022b), since the suite runs
  against the test project after manual application.

**Proposed doc edits (apply in this sub-PR, alongside the migration):**
- `ERP_DATA_MODEL.md` → `invoice` entity: change status line to
  `status (text — 'draft' | 'sent' | 'partial' | 'paid' | 'cancelled'; 'overdue' is DERIVED at read time from due_date, never stored — see LENS-022 D1)`.
- `ERP_DATA_MODEL.md` → `booking` entity: annotate `deposit_invoice_id` /
  `final_invoice_id` as `uuid FK → invoice` (true as of migration_005).
- `ERP_DATA_MODEL.md` → `comm_log`: add `invoice_id (uuid FK → invoice, nullable — set on payment reminders)`.
- `CLAUDE.md` Current Build State: last migration → `migration_005_invoice_payment.sql`
  (after manual application to both projects), last ticket / branch per ritual.
- `DECISIONS_LOG.md`: entries for D1 (derived overdue) and D2 (chase state
  from comm_log).

---

### LENS-022b — invoice/payment ERP module + manual entry (the pre-Stripe data source)

`src/lib/erp/invoice/index.ts` (+ `invoice.test.ts` in the same PR — money
logic is not shippable untested), following the `ErpResult<T>` /
write-then-publish pattern:

- `createInvoice(supabase, input)` — booking-linked; **`recipient_email`
  defaults to `client.parent_email` when set, else falls back to
  `client.email`** (the ERP model's stated rule; Morgan's #1 pain — the mom
  with the credit card must be the default, not an option someone has to
  remember). **The NULL fallback is the mainline path, not an edge case: all
  401 imported clients currently have `parent_email = NULL`**, so billing
  must work first-class off `client.email` and upgrade automatically as
  parents are captured via the drawer (LENS-020). Both branches get explicit
  test coverage. Editable override in the UI. Manual creation sets
  `status='sent'` (D4). Publishes
  `invoice.created`. Setting `kind='deposit'|'final'` also sets
  `booking.deposit_invoice_id`/`final_invoice_id` when empty.
- `recordPayment(supabase, input)` — inserts `payment`, then recomputes
  invoice status from `sum(payments)`: `>= amount_cents` → `'paid'` +
  `paid_at`; `> 0` → `'partial'`. Publishes `payment.received` (already in the
  event union; `stripe_payment_intent_id: null` for manual). Method `'stripe'`
  rejected with `validation_error` until Phase 2.
- `deletePayment(supabase, id)` — manual-correction path; recomputes invoice
  status downward (paid → partial/sent). Refuses rows with a
  `stripe_charge_id` (future-proofing, `validation_error`).
- `cancelInvoice(supabase, id)` — status → `'cancelled'`; publishes
  `invoice.cancelled`.
- `listOpenInvoices(supabase)` — the sweep read: status in sent/partial, not
  deleted, joined to client (display_name, parent_name, parent_email) and
  booking (session_date, status), each row carrying **derived** fields:
  `balance_cents` (amount − payments), `is_overdue`, `days_overdue` — computed
  in the photographer's timezone (D1).
- New domain events in `src/types/events.ts`: `invoice.created`,
  `invoice.cancelled`, `invoice.reminder_sent` (payload: invoice_id, step,
  recipient — no body content; ZDR posture).

UI — wire `src/app/(dashboard)/payments/page.tsx` to real data and delete
`DATA.payments` from `src/lib/mock/data.ts`:

- Stats row (Outstanding / Overdue / Paid MTD) from real aggregates.
- Invoice table: client name, **routing indicator** (→ parent name when
  routed to parent — make the wedge visible), session, balance, due date,
  reminders-sent count (from `comm_log` by `invoice_id`), status pill
  (overdue = derived, red).
- "New invoice" flow: pick an upcoming booking → amount (dollars in UI,
  **cents in every API and DB boundary** — no floats), kind, due date,
  recipient (pre-filled per routing rule, editable, shows *why*: "Susan
  Hartwell — parent on file").
- "Record payment" flow: invoice → amount, method (cash/check/other; Stripe
  greyed with "Phase 2"), received date.
- **Cutover assist (Rule 3, never open empty):** when zero invoices exist,
  the page's empty state is a migration, not a blank slate: list upcoming
  bookings with no linked invoice ("6 upcoming shoots have no invoice on
  file") with one-click "add invoice" per row. Endowed progress from data
  she already has.
- Zod at every API boundary; auth check at top of every handler; SWR for
  client fetching; `data-testid` on all interactive elements.

---

### LENS-022c — dashboard "who owes / what's late" card + Outstanding KPI

> Branch after LENS-021 merges — same files (`mission-control.tsx`, `page.tsx`).

- `DashboardKpis.outstanding` ← real sum of open-invoice balances (cents →
  formatted). Replaces the honest `null` at `page.tsx:70`.
- New money card in `mission-control.tsx`, resolving the `LENS-022` TODOs at
  lines 18–19 / 216–217:
  - **What's late first** (the anxiety line): overdue invoices, most-overdue
    on top — client, parent-routing name, balance, days overdue. Red only
    when true (derived), never decorative.
  - **Who owes next:** open invoices due soonest, with due-in days and
    chase state ("reminder 2 of 4 sent" once 022e lands; "no chase" before).
  - Single glance, zero navigation (Rule 1): counts + dollars readable
    without interaction; the card links to `/payments` for action but never
    requires the click to answer "am I okay?".
- Honest states (Rule 4): no invoices yet → the cutover-assist prompt (same
  as 022b's empty state), **never fake zeros** — "$0 outstanding" when she
  simply hasn't entered her book yet is a confident lie. Loading → skeleton,
  not stale numbers.
- The who's-next card **stays free of payment pills** in this PR unless the
  join is exact: a paid/balance pill on a booking row must reconcile with the
  invoice table per Rule 4 or not ship. If in doubt, ship the money card
  only; pills are a follow-up.
- No gamification (Rule 6): a paid invoice leaves the list. No confetti, no
  celebration copy.

---

### LENS-022d — minimal Gmail outbound slice (`gmail.send`)

The chase engine needs to send email as the photographer. Gmail is the
registry-contracted outbound channel (Phase 1, CommsAgent/BillingAgent) — no
transactional-email shortcut; reminders must come from Morgan's own address
(deliverability + replies land in her inbox, where she already works).

- **Scope addition — per D6:** re-run the 021a consent flow requesting
  **both** scopes (calendar read + `gmail.send`), `prompt=consent` +
  `include_granted_scopes=true`. Callback verifies the *granted* scopes from
  the token response, overwrites the `'calendar'` row, upserts the `'gmail'`
  row with the same encrypted token pair, and records the granted union in
  each row's `scope[]`. Partial grants handled per D6's granular-consent
  guard — never a row claiming a scope its token lacks, never overwriting
  the calendar credential with a narrower grant. Existing Calendar sync
  (LENS-021) must work unchanged after reconnect — that's an acceptance
  test, not an assumption. **Rebase on merged LENS-021 before starting** —
  the oauth/status modules are mid-flight.
- `src/lib/integrations/gmail/client.ts` — the **only** file importing the
  Gmail SDK (ANTI_PATTERNS #4). One function for now:
  `sendEmail({to, subject, body_html, body_text})` → `{message_id,
  thread_id}`. Token refresh via the 021a/b wiring. Zod-validate the API
  response at the boundary.
- Registered in `src/lib/ai/tools/registry.ts` as `gmail.send` with Zod
  input/output (BillingAgent is a declared consumer per AGENT_ARCHITECTURE,
  even though the MVP caller is the deterministic runner).
- Error handling per registry: 429 → backoff (max 3), 401/revoked →
  `IntegrationAuthError` surfaced as a "reconnect Google" state — never a
  silent stop (a silently dead chase is the incumbent's exact failure mode).
- **Security-sensitive: tests in the SAME PR** (anti-pattern #33 / standing
  feedback): token handling round-trip, refresh-on-expiry, and that neither
  tokens nor email bodies are logged (#11 — ZDR: `comm_log` is the ledger for
  content; app logs get counts and IDs only).
- **Proposed `INTEGRATION_REGISTRY.md` edit (apply in this sub-PR):** mark the
  Gmail section as partially shipped — `gmail.send` slice live for
  BillingAgent chase (LENS-022d); inbound/Pub-Sub, `read_thread`, `search`,
  labels still pending the Gmail lead-intake ticket.

---

### LENS-022e — the payment chase (the wedge)

> Depends on 022b (invoices), 022d (send). Branch from 022d per branching rules.

The persona contract, verbatim: *chase until paid, every 24 hours once late,
escalating message, to the person who actually pays, stops the second money
hits.* Success looks like: *"a mom getting a payment reminder that says 'Hi
Susan, the final payment for Emma's senior session is due in 3 days' — and
actually paying because the email went to the right person."*

**Sequence definition** — seeded as a default `comm_sequence` row per
photographer (`trigger_event='invoice.chase'`, reusing the existing table;
`steps jsonb`), so cadence and copy are data, not code, and a future settings
UI edits them without a schema change. Default steps (mirrors the mock rules
panel the payments page already sketches):

| Step | When | Tone |
|------|------|------|
| 1 | 7 days before due | Friendly heads-up |
| 2 | 3 days before due | Direct — amount, due date |
| 3 | Due date | "Due today" |
| 4+ | Every 24h after due | Escalating: overdue notice → firm balance-due, references days overdue |
| stop | After 5 overdue sends | **Escalate to photographer** (dashboard "needs attention" item), auto-emails pause — past this point it's a relationship conversation, not a template's job |

**Recipient resolution — at send time, not schedule time:** `parent_email`
when set, **else `client.email` — the fallback is explicit, mandatory
behavior, never a skip.** A chase that no-ops on `parent_email = NULL` would
silently disable the wedge for the entire imported book (all 401 clients have
NULL parents today). Re-read per send, so a parent added via the client
drawer mid-chase reroutes the very next reminder. Greeting resolves to
whoever is actually receiving (`parent_name` → "Hi Susan"; no parent →
client's first name), body references the subject teen and session ("Emma's
senior session"). Merge fields (string substitution only, D3):
`recipient_first_name`, `client_first_name`, `session_type`, `session_date`,
`balance_due`, `due_date`, `days_overdue`, `payment_instructions` — the last
from a photographer-editable snippet (pre-Stripe there's no payment link;
Phase 2 swaps in `stripe_payment_link_url` when present). Every rendered
amount comes from `balance_cents` at send time — partial payments shrink the
ask automatically.

**Stop conditions (checked immediately before every send — "stops the second
money hits"):**
1. Invoice `paid` / `cancelled` / soft-deleted → chase over. **A reminder sent
   for a paid invoice is a P0 bug** — it is the exact trust-break Rule 4
   describes, aimed at a client's mother.
2. Booking `cancelled` → chase over.
3. Photographer paused this invoice's chase (per-invoice pause toggle on the
   payments page; state in `comm_sequence_state.status='paused'`) → skip.
4. Missing/revoked Gmail credentials → skip + surface "chase paused —
   reconnect Google" on dashboard and payments page. Never fail silently
   (the incumbent's "it goes out once, then nothing" is the villain here).

**Runner + scheduling:** deterministic runner (`runInvoiceChase` under
`src/lib/erp/invoice/chase.ts`), invoked by a Vercel Cron route
(`src/app/api/cron/invoice-chase/route.ts`, new `vercel.json`) **hourly**,
guarded by a `CRON_SECRET` bearer check (new env var — add to CLAUDE.md env
table in the build-state update). Hourly because send timing is local: a step
fires only when it is **8am–10am in `photographer.timezone`** and its
due-condition holds. Idempotency = derived chase state (D2): at most one
reminder per invoice per local day, guard = "no `comm_log` row for this
`invoice_id` today (local)". Crash-safe with no state table: the log is the
state. Send-then-log per D5.

Every send: `gmail.send` → `comm_log` row (`direction='outbound'`,
`channel='email'`, `agent_id='billing'`, `invoice_id`, `sequence_id`, subject
+ body — the ledger holds content; app logs hold IDs only) → publish
`invoice.reminder_sent`.

**Notification discipline (Rule 5):** reminders go to the payer, not the
operator. Morgan gets exactly two operator-facing signals: the step-5
escalation ("I've nudged Susan 5 times — your turn") and the
credentials-broken warning. Both are real business events. No "reminder sent
✓" pings, ever.

**Tests in the same PR** (this is money + comms — the two things we cannot
ship on vibes): step selection across the timeline (T-8 → nothing, T-7 →
step 1, due+3 with 2 sends → next escalation), stop-on-paid *between*
schedule and send, partial-payment balance rendering, recipient routing —
parent set, **parent NULL → client.email fallback (must send, never skip)**,
and mid-chase parent addition — per-day idempotency across repeated
hourly invocations, timezone boundaries (a due_date is "past" per the
photographer's calendar, not UTC), pause behavior, and the 5-send cap →
escalation.

## Accuracy is a release gate (Rule 4)

"Who owes / what's late" is a P0-accuracy surface — for money, doubly so. The
morning read that shows a cleared payment as outstanding (or the reverse) ends
the habit. Before release: dashboard Outstanding must equal the payments-page
sum must equal `sum(balance of open invoices)` for the test account; recording
a payment must flip every surface (KPI, card, table, chase) in one refresh;
`is_overdue` must roll over at local midnight, not UTC. Prefer a skeleton over
a stale number.

**Verification:** the prod test-photographer account (401 seeded clients) gets
a realistic invoice book — overdue, due-soon, partial, paid, parent-routed and
client-routed — entered through the UI (dogfooding the manual entry), then
each sweep surface is reconciled by hand against it. Chase e2e is verified on
the test account with a real connected Gmail before Morgan sees it.

## Habit check (PM persona — audited against all seven HABIT_DESIGN rules)

> Run 2026-07-05 against this spec as written (post D1–D6). Verdict: **passes
> all seven**, with two watch-items for the implementing session, flagged
> inline below. Re-run at each sub-PR's quality gate — this section audits the
> spec; the gate audits the code.

**Rule 1 — morning sweep is one screen: PASS.** "Who owes / what's late" lands
on the existing dashboard (022c) beside "who's next," with the Outstanding KPI
in the existing strip. Late-first ordering answers the anxiety question
without interaction; the `/payments` link is for *acting*, never for
*knowing*. Time-to-confidence: zero clicks added to the read. *Watch-item:*
the card must not grow filters/tabs during build — the moment "am I okay?"
needs a toggle, this rule is violated.

**Rule 2 — onboarding is cutover, not a tour: PASS.** Manual entry (022b) is
explicitly a migration of Morgan's open book, and the chase directly replaces
the incumbent's broken reminder feature — the strongest "cancel the old tool"
argument Phase 1 has shipped. Every invoice entered removes a reason to keep
the spreadsheet tab.

**Rule 3 — never open empty: PASS.** Zero-invoice states (022b page, 022c
card) render the cutover assist — upcoming bookings with no invoice on file,
one-click add — seeded from data she already has (401 clients, calendar-synced
bookings). No "create your first invoice" blank slate anywhere on the primary
user's path.

**Rule 4 — dashboard accuracy is P0: PASS**, and load-bearing in four
decisions: overdue derived at read time (D1, cannot lag), stop-on-paid checked
at send time (a reminder for a paid invoice is named a P0 bug), no fake zeros
(honest cutover state instead), and the who's-next card stays free of payment
pills unless the join reconciles exactly. Release gate section requires
hand-reconciliation on the seeded test account before Morgan sees it.

**Rule 5 — notification discipline: PASS.** The chase's outbound volume is
aimed at the *payer*, not the operator — it generates zero operator
notifications in the happy path. Morgan receives exactly two signals, both
real business events: (1) the 5-send cap escalation — after five unanswered
nudges, a sixth templated email is no longer signal, it's spam that damages
her client relationship; converting it into one "this account needs a human"
item is precisely what a trustworthy trigger looks like, and it's the moment
she would genuinely want surfaced (today she finds out two days before the
shoot); (2) the broken-credentials warning — a paused chase presented as
running is the incumbent's exact failure, so surfacing it is accuracy, not
noise. No "reminder sent ✓" pings, no digest, no engagement nudges.
*Watch-item:* the escalation item must live in the dashboard's
needs-attention surface, not a push/email blast per reminder step.

**Rule 6 — no gamification of money: PASS.** Paid invoices leave the list —
the reward is the list getting shorter and the red going away (relief, not
celebration). No confetti, no streaks, no "🎉 you got paid!" copy. Red is
derived state, never decoration.

**Rule 7 — investment compounds and loads the next trigger: PASS.** Each
invoice entered makes tomorrow's sweep more complete *and* arms a future
trigger (its chase). Connecting Gmail (022d) converts every future invoice
into an automated sequence. Parent capture (LENS-020 drawer) now pays
compounding interest: adding a parent mid-chase visibly reroutes the next
reminder. Stored value grows with use; nothing entered is ever silently lost
(soft-delete on invoice, hard-delete on payment is an explicit, logged
correction path).

**Quality-gate line (no gamification / no empty-state / notification
discipline):** covered by Rules 6 / 3 / 5 above respectively — enforced
per-sub-PR via the Gates section, PM persona owns the check at review.

## Out of scope
- Stripe payment links, webhooks, hourly reconciliation → Phase 2 (columns
  ship empty now; registry contract already written).
- QuickBooks export (`quickbooks_invoice_id` ships empty) → Phase 3.
- Refund flows (`kind='refund'` exists; no UI/logic) → Phase 2.
- Client-facing invoice/payment portal, invoice PDFs → later.
- Editing chase cadence/copy in the UI (data model supports it via
  `comm_sequence.steps`; settings UI is a follow-up ticket).
- The BillingAgent LLM run loop (prompts/evals) → Phase 2; this ticket builds
  its deterministic substrate and tool surface.

## Gates (every sub-PR)
- `npx tsc --noEmit` + `npm run lint` + `npm run check:error-handling` clean.
- Money is integers (cents) end-to-end; formatting only at render.
- New tables: RLS + photographer-scoped policies in the same migration; RLS
  suite covers invoice + payment isolation.
- Gmail SDK only inside `src/lib/integrations/gmail/` (#4); LLM SDK nowhere
  new (#3); Zod at every API/tool boundary; auth check atop every handler.
- OAuth/token/comms PRs ship tests in the same PR (#33); no tokens, prompt
  content, or email bodies in app logs (#11).
- `data-testid` on all interactive elements.
- Migrations: SQL files only, never executed (#1); applied manually to prod
  **and** test projects before merging code that depends on them.
- DECISIONS_LOG entries match actual behavior (D1, D2, D5, D6).
- HABIT check per sub-PR: serves the sweep, honest states, no empty-slate for
  the primary user, no gamification, notification discipline (PM persona owns
  this check).
