# LENS-020 — Client drawer: real data + parent-contact capture

> Feature spec. Phase 1, Sprint 3. Branch: `LENS-020-client-drawer-parent-contact`.

## Why (HABIT_DESIGN)

401 real clients are now live (LENS-018 import). Two of the design partner's
documented *daily* pains map directly onto the client drawer:

- **"I can't copy the phone number in the mobile app"** — she leaves the app,
  opens Safari, logs in, finds the client, copies from there, every shoot day.
- **"The system won't let me add parent contact"** — her clients are teenagers;
  the moms pay. Payment reminders must reach the parent. Capturing parent contact
  is step one of that (the payment-chase flow itself is a later ticket).

Serves the daily sweep by making a real client's contact info one tap away, and
lays the parent-contact groundwork the BillingAgent payment-chase will need.

## Current state (what already exists)

- `/clients` list **already has working search** (name/email/parent) and renders
  real imported clients (`clients-table.tsx`).
- The **drawer is 100% mock** — `ClientDrawer` reads `DATA.profile` and ignores
  which client was clicked. `openDrawer()` takes no client argument.
- `client` table has `phone`, `parent_email`, `parent_name`, `parent_phone`,
  `notes` columns **and an UPDATE RLS policy** (migration_001). No migration
  needed.
- `CopyButton` primitive exists but is unused in the drawer.

## Scope

1. **Drawer receives the clicked client.** `drawer-context` carries the selected
   `Client | null`; `openDrawer(client?)`. Layout holds selected-client state.
   Rows in `clients-table` pass the real client.
2. **Overview tab renders real data** from the selected client: name, email,
   phone, parent name/email/phone, source, added date. Email and phone (client +
   parent) get `CopyButton` — the mobile-copy fix.
3. **Edit contact** — inline edit of `phone`, `parent_name`, `parent_email`,
   `parent_phone`, `notes` via a server action → ERP `updateClientContact` →
   `revalidatePath('/clients')`.
4. **Honest empty states** for the tabs backed by data that doesn't exist yet
   (timeline / payments / messages) — no more mock `DATA.profile`. Rule 4.
5. **Search** gains phone matching (small).

## ERP

- `updateClientContact(supabase, id, patch)` in `src/lib/erp/client/index.ts`.
  Patch = subset of `{ phone, parent_name, parent_email, parent_phone, notes }`.
  Light validation (email shape) via `validationError`. RLS-scoped by the
  existing UPDATE policy. Returns `ErpResult<Client>`.

## Out of scope (own arcs)

- **"Who's next" / Today's shoots → LENS-021**, sourced from **Google Calendar**
  (BookingAgent). Session has no bookings CSV export — client list only — so a
  CSV import is not the path; Calendar is.
- **"Who owes" / invoice + payment schema → LENS-022** (new migration → Stripe).
- Payment-chase-to-parent flow (BillingAgent) — after invoices exist.

## Gates

- `client` RLS + UPDATE policy already exist (no migration).
- `data-testid` on all interactive elements.
- Server action does `supabase.auth.getUser()` before writing (anti-pattern #6).
- `npx tsc --noEmit` and `npm run lint` clean.
- No mock data rendered as confident real data (Rule 4).
