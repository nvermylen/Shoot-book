# LENS-024 — Phase 1 acceptance runbook + cutover prep

> Operational runbook. Phase 1, Sprint 3 close-out. Branch: `LENS-024-phase1-acceptance`.
> This is not a feature spec — nothing here changes code. It is the ordered,
> checkable path from "Phase 1 loop code-complete" to "Morgan can see the sweep."

## What this clears

Two release gates, verbatim from the specs, both P0 (HABIT_DESIGN Rule 4):

- **LENS-022:** dashboard Outstanding = payments-page sum = `sum(balance of open
  invoices)` for the test account; recording a payment flips every surface in one
  refresh; `is_overdue` rolls over at local midnight, not UTC. Verified against a
  realistic invoice book **entered through the UI** (dogfooding manual entry),
  reconciled by hand. Chase e2e on a real connected Gmail before Morgan sees it.
- **LENS-023:** run intake twice over the same window → zero duplicate leads;
  test inquiries (new sender / existing-client reply / spam-shaped) → exactly the
  right ones become leads; revoke `gmail.readonly` → paused state surfaces within
  one cron cycle; inquiries page count reconciles with `lead` rows **exactly**.

## Test-account state (verified against prod 2026-08-02 — read before starting)

Preflight found the environment materially different from what the build state
claimed. Verified directly against both Supabase projects:

- **Prod (`vvcuennzifsovbbylolx`) is missing migrations 005, 006, and 007.**
  There is no `invoice` or `payment` table, no `comm_sequence_state.invoice_id`,
  no `lead.thread_id`. The entire money surface (LENS-022) and intake thread
  linkage (LENS-023) have **never had schema behind them in prod** — the
  deployed app's money card has been rendering its failed/cutover state since
  022c shipped, and the chase cron no-ops. The earlier "applied to prod" notes
  were wrong (most likely applied to the test project's dashboard by mistake).
- **The test project (`eqqfukokwtwqwcqqeneo`) already has all migrations
  through 007.** It holds no data.
- **Two prod accounts exist.** `nathan.vermylen@yahoo.com` ("Morgan Vermylen
  Photography") is the original test login — its 401 imported dummy clients are
  all soft-deleted and its Google credential is the old single-scope
  `calendar.readonly` row. `nathan.vermylen@gmail.com` ("Nate") is a fresh
  account and is **the acceptance target** for this runbook. It has no Google
  connection yet.
- **A.1 is done:** 6 acceptance clients were CSV-imported into the gmail
  account on 2026-08-02 (C1 = the yahoo address, so client-reply intake tests
  can be sent from a real distinct mailbox; C2–C6 = `+`-alias gmail addresses,
  so chase mail lands in the owner's own inbox). Parent contacts on C2/C4 still
  need adding through the client drawer.

---

## Step 0 — Owner preconditions (in order; everything below is blocked on these)

| # | Action | Where | Verify |
|---|--------|-------|--------|
| 0.1 | ~~Restore login~~ **DONE** — acceptance runs as `nathan.vermylen@gmail.com` | — | Login verified 2026-08-02 |
| 0.2 | Apply **`migration_005`, then `006`, then `007` — in order — to PROD** (`vvcuennzifsovbbylolx`). Double-check the project ref in the dashboard URL before running: the test project already has all three, and applying to the wrong project is exactly how this gap happened | Supabase SQL editor (never via CC) | Query A below returns three rows on prod |
| 0.3 | Connect Google on the gmail account — **all three consent boxes** (calendar, gmail.send, gmail.readonly) | Dashboard → any Connect Google button | "Who's next" syncs; inquiries card shows watching-state, not connect-state |
| 0.4 | Update CC build state after 0.2 (migration claims corrected there 2026-08-02) | — | — |

**Query A — prod schema complete? (expect 3 rows)**
```sql
select 'migration_005' as m from information_schema.tables where table_name = 'invoice'
union all
select 'migration_006' from information_schema.columns
  where table_name = 'comm_sequence_state' and column_name = 'invoice_id'
union all
select 'migration_007' from information_schema.columns
  where table_name = 'lead' and column_name = 'thread_id';
```

After 0.3, confirm granted scopes took (intake activates only on `gmail.readonly`):
the dashboard Fresh-inquiries card must show the **watching** state ("Watching your
inbox"), not the connect or capture-off state.

---

## Part A — Seed the invoice book (through the UI) and hand-reconcile

> All entry happens in the app (dogfooding LENS-022b manual entry). SQL is for
> verification only. Run verification queries in the Supabase SQL editor,
> substituting the test account's photographer id for `:pid`.

**A.1 — Create clients: DONE 2026-08-02** (CSV import, 6 created, 0 errors —
there is no create-client UI). Remaining from this step: add parent contact to
C2 and C4 **through the client drawer** (LENS-020 edit path — doubles as its
acceptance touch). Suggested parent addresses: `+c2parent` / `+c4parent`
aliases.

| Client | Email | Parent contact | Purpose |
|--------|-------|---------------|---------|
| C1 Riley Sanchez | nathan.vermylen@yahoo.com | none | overdue invoice, client-routed chase |
| C2 Emma Walsh | +c2 alias | parent on file (drawer edit) | overdue invoice, **parent-routed** chase |
| C3 Ava Chen | +c3 alias | none | due-soon invoice |
| C4 Maya Patel | +c4 alias | parent on file (drawer edit) | partial payment |
| C5 Jack Turner | +c5 alias | none | fully paid invoice |
| C6 Lily Brooks | +c6 alias | none | booked, **no invoice** (cutover-assist row) |

**A.2 — Enter invoices** via `/payments` (dates relative to the test day, in the
account's timezone):

| Invoice | Client | Amount | Due | Payments | Expected state |
|---------|--------|--------|-----|----------|----------------|
| I1 | C1 | $400 | 10 days ago | none | overdue 10d, full balance late |
| I2 | C2 | $650 | 3 days ago | none | overdue 3d, chase routes to parent |
| I3 | C3 | $300 | in 5 days | none | due-soon, not overdue |
| I4 | C4 | $500 | in 2 days | $200 recorded | partial — balance $300 |
| I5 | C5 | $250 | 7 days ago | $250 recorded | **paid — appears nowhere open** |

**A.3 — Hand-reconcile.** All four must agree, to the cent:

1. Dashboard **Outstanding KPI**
2. "Who owes / what's late" card totals (late + due next)
3. `/payments` page sum of open balances
4. **Query B**:
```sql
select coalesce(sum(i.amount_cents - coalesce(p.paid, 0)), 0) as outstanding_cents
from invoice i
left join lateral (
  select sum(amount_cents) as paid from payment where invoice_id = i.id
) p on true
where i.photographer_id = :pid and i.status in ('sent', 'partial');
```
Expected with the book above: **$1,650** (400 + 650 + 300 + 300). Overdue slice:
**$1,050** (I1 + I2). If any surface disagrees → P0 bug, stop, file it.

**A.4 — Flip test.** Record a $400 payment on I1. In **one refresh**: KPI drops to
$1,250, I1 leaves "what's late", payments table shows paid, chase for I1 stops
(Rule 6: a paid invoice simply leaves the list — no celebration).

**A.5 — Midnight rollover.** I3 (due in 5 days) must not show overdue before
local midnight of its due date. Spot-check `days_overdue`/`is_overdue` derivation
is in the account timezone, not UTC (compare a due-today invoice before/after
17:00 PT if the account is US-Central).

---

## Part B — Chase E2E (real send, test account)

Preconditions: 0.3 done (`gmail.send` granted), I1/I2 overdue and unpaid.

1. Trigger the cron manually (owner holds `CRON_SECRET`):
```
curl -H "Authorization: Bearer $CRON_SECRET" https://shoot-book.vercel.app/api/cron/invoice-chase
```
2. **Expect:** one real reminder email lands for I1 (to C1's address) and one for
   I2 **to C2's parent address** (parent-routed). Check the connected Gmail's
   Sent folder — the mail is real.
3. **Idempotency:** run the same curl again immediately → zero new sends
   (cadence gate). **Query C** — comm_log is the ledger:
```sql
select invoice_id, count(*) sends, max(sent_at) last
from comm_log
where photographer_id = :pid and direction = 'outbound' and invoice_id is not null
group by invoice_id;
```
4. **Pause intent (LENS-D-027):** pause the chase on I2 via the UI → next cron
   run sends nothing for I2, I1 unaffected. Unpause → resumes on cadence.
5. **Escalation:** cap is `OVERDUE_SEND_CAP = 5` overdue sends, then the card
   shows "your turn — chase stopped after N notes." Verifying this live takes 5
   cadence cycles — acceptable to verify the counter math via Query C plus one
   observed send, rather than waiting out the full cadence.
6. **Degradation:** disconnect Google → "who owes" card must show the
   chase-not-sending warning (Rule 4: broken is loud, never silent). Reconnect.

---

## Part C — Intake acceptance (Gmail → lead)

Preconditions: 0.2 (thread_id column) and 0.3 (`gmail.readonly`) done. Without
0.2, every intake run reports a thread_id write error; without 0.3, intake is
inert by design.

1. **Triage matrix.** From three senders, email the connected inbox:
   - a brand-new address with an inquiry → **becomes a lead** (`gmail_inbound`)
   - an existing client's address (C1) replying on a thread → **skipped**
     (`known_sender`), no lead
   - a spam-shaped message from a new address → lead created, then LeadAgent
     marks it **disqualified** (kept, never deleted)
2. Trigger intake:
```
curl -H "Authorization: Bearer $CRON_SECRET" https://shoot-book.vercel.app/api/cron/gmail-lead-intake
```
3. **Double-run:** run the same curl again over the same window → zero new lead
   rows. **Query D — duplicates must be empty:**
```sql
select source_message_id, count(*) from lead
where photographer_id = :pid and source_message_id is not null
group by source_message_id having count(*) > 1;
```
4. **Exact reconciliation.** Inquiries page count and dashboard Fresh-inquiries
   `newCount` must equal **Query E** exactly:
```sql
select count(*) from lead
where photographer_id = :pid and qualification_status = 'new' and deleted_at is null;
```
5. **Revoke test.** Revoke `gmail.readonly` (Google account → security → app
   access, or reconnect with the box unchecked) → within one cron cycle the
   inquiries surfaces show the capture-off / paused state. Re-grant after.

---

## Part D — Sign-off

| Gate | Check | Pass |
|------|-------|------|
| LENS-022 | A.3 four-way reconciliation exact | ✅ 2026-08-02 — KPI = card = payments = SQL, $1,650 / $1,050 to the cent; parent routing verified on I2/I4 |
| LENS-022 | A.4 one-refresh flip | ✅ 2026-08-02 — $400 on I1 → one navigation: KPI $1,250, Riley gone from what's-late |
| LENS-022 | A.5 local-midnight rollover | ✅ by derivation — days_overdue computed via localDateString(photographer tz); I1 showed exactly 10d late for a 07-23 due date on 08-02 CT |
| LENS-022 | B.2 real sends, parent-routed correctly | ✅ 2026-08-02 — 3 real Gmail sends: Ava→client, Emma/Maya→parent addresses, greeting names correct, Maya asked for the $300 balance not the $500 face |
| LENS-022 | B.3 double-run sends nothing | ✅ 2026-08-02 — immediate rerun: sent 0, skipped already_sent_today: 3 |
| LENS-022 | B.4 per-invoice pause honored | ✅ 2026-08-02 — UI pause on I2 → run skipped {paused: 1}, others unaffected; unpaused after |
| LENS-023 | C.1 triage matrix exact | ◐ 2026-08-02 — spam/notification leg proven ×23 (every real junk mail disqualified-kept with sensible reasons, zero false qualifications); client-sender skip proven ×13 (known_sender) + self ×3; REMAINING: one real inquiry from a non-client address → qualified lead (owner sends) |
| LENS-023 | C.3 double-run zero dupes (Query D empty) | ✅ 2026-08-02 — local run created 23, two prod reruns created 0 (duplicates: 23, errors: 0); Query D returns zero collisions |
| LENS-023 | C.4 counts reconcile exactly (Query E) | ✅ 2026-08-02 — Query E = 0 'new' = dashboard watching-state with no rows; re-check once the first real inquiry lands nonzero |
| LENS-023 | C.5 revoke → paused within one cycle | ☐ owner — revoke gmail.readonly in Google security settings, then watch the inquiries card flip to capture-off |

**Method note (B):** the chase's 8–10am-local send window was crossed for testing
by briefly setting the photographer's timezone to Pacific/Pago_Pago (restored to
America/Chicago immediately after). All entry (clients import aside) went through
the real prod UI via Playwright — parent contacts in the drawer, invoices and
payments in /payments, pause toggle on the table.

**Part C addendum (2026-08-02, after ANTHROPIC_API_KEY landed):** first live run
exposed #56 — the model fences its JSON and both agents' raw JSON.parse failed,
so every qualification errored while create-then-qualify left rows stuck 'new'.
Fixed (gateway extractJsonText), artifact rows purged twice (0 references each
time), then a clean pass: 23 candidates → 23 judged, 0 errors.

**Found and fixed during execution:** #48 booking→invoice embed ambiguity
(payments page hard-failed on full schema), #49 intake self-mail + thrown-agent
isolation, #50 intake fails closed without the gateway key, #51 fail-closed state
surfaced in cron response, #52 sync write-failures surfaced on the sweep, #53
Booked-last-30d KPI real, #54 hydration/timezone correctness on / and /clients.
Full-13-route sweep clean 2026-08-02 (zero console errors, zero failed states).

LENS-022 gates: **all green**. LENS-023 gates: blocked on the key, then C.1–C.5
per Part C above. B.6 (disconnect degradation) deferred — needs an owner
re-consent afterward; the chaseSendingBroken path is unit-covered.

---

## Cutover prep (Morgan, day 1 — after sign-off)

The two-system trap is the one risk that overrides everything: if she hedges
between Lens and the old ritual, the habit never forms. Target: single-system
cutover within 14 days.

1. Her own Google connect, all three boxes — calendar sync + chase + intake live
   from minute one (never open empty: "who's next" fills itself).
2. Import her real client list (LENS-018 import path).
3. Enter her **open** invoice book through `/payments` — only open money; history
   stays in the old system. This is what makes tomorrow's sweep answer "who owes
   me" truthfully.
4. Hand-reconcile her Outstanding once, together, against her own records — the
   trust moment the whole product hangs on.
5. Agree the contract: mornings happen in Lens only. The old tabs stay closed;
   anything Lens can't answer in the sweep gets filed as a bug, not worked
   around.
