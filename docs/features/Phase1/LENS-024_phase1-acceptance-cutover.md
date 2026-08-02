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

## Test-account state (read before starting)

The prod test-photographer account is **not** in the state the LENS-022 spec
assumed. As of 2026-08-02: the 401 imported dummy clients are **soft-deleted**
and the previously stored password **no longer authenticates**. The runbook
below creates a small fresh client set instead; nothing here depends on the 401.

---

## Step 0 — Owner preconditions (in order; everything below is blocked on these)

| # | Action | Where | Verify |
|---|--------|-------|--------|
| 0.1 | Restore login to the test account (password reset) | Supabase dashboard → Auth → user → reset password | You can log in at shoot-book.vercel.app |
| 0.2 | Apply `migration_007_lead_thread_id.sql` to **prod and test** projects | Supabase SQL editor (never via CC) | Query A below returns one row on each project |
| 0.3 | Reconnect Google on the test account — **all three consent boxes** (calendar, gmail.send, gmail.readonly) | Dashboard → any Connect/Reconnect Google button | "Who's next" still syncs; inquiries card shows watching-state, not connect-state |
| 0.4 | Update CC memory/build state if 0.1 changed credentials handling | — | — |

**Query A — migration_007 applied?**
```sql
select column_name from information_schema.columns
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

**A.1 — Create clients** (the 401 are soft-deleted; there is **no create-client
UI** — clients enter via the LENS-018 CSV import). Build a 6-row CSV in the
Session export format and import it:

```
npx tsx scripts/import-session-clients.ts <csv-path>            # dry-run first
npx tsx scripts/import-session-clients.ts <csv-path> --commit
```

Use addresses you control for C1–C3 (they receive real chase/intake email in
Parts B–C). Then add parent contact to C2 and C4 **through the client drawer**
(LENS-020 edit path — this doubles as its acceptance touch):

| Client | Parent contact | Purpose |
|--------|---------------|---------|
| C1 | none | overdue invoice, client-routed chase |
| C2 | parent on file (drawer edit) | overdue invoice, **parent-routed** chase |
| C3 | none | due-soon invoice |
| C4 | parent on file (drawer edit) | partial payment |
| C5 | none | fully paid invoice |
| C6 | none | booked, **no invoice** (cutover-assist row) |

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
| LENS-022 | A.3 four-way reconciliation exact | ☐ |
| LENS-022 | A.4 one-refresh flip | ☐ |
| LENS-022 | A.5 local-midnight rollover | ☐ |
| LENS-022 | B.2 real sends, parent-routed correctly | ☐ |
| LENS-022 | B.3 double-run sends nothing | ☐ |
| LENS-022 | B.4 per-invoice pause honored | ☐ |
| LENS-023 | C.1 triage matrix exact | ☐ |
| LENS-023 | C.3 double-run zero dupes (Query D empty) | ☐ |
| LENS-023 | C.4 counts reconcile exactly (Query E) | ☐ |
| LENS-023 | C.5 revoke → paused within one cycle | ☐ |

All boxes checked → Phase 1 is accepted and the sweep may be shown to Morgan.

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
