# LENS-021 — "Who's next" / Today's shoots, sourced from Google Calendar

> Feature spec (DRAFT). Phase 1, Sprint 3+. Branch: `LENS-021-calendar-whos-next`.
> **Not started** — pending formal kickoff. This is the first live external
> integration and the biggest ticket of Phase 1 so far; it is decomposed into
> sub-PRs below and should be built in dependency order.

## Why (HABIT_DESIGN)

The morning sweep answers three questions: **who owes / who's next / what's late.**
LENS-019/020 made "who" real (401 clients, contact capture). This ticket makes
**"who's next (when/where)"** real — the second sweep pillar — by pulling the
photographer's shoots from **Google Calendar**.

Why Calendar, not a CSV: Session exports the **client list only** (verified —
no bookings/sessions export). The design partner already lives in Google
Calendar (her Session bookings sync there). Calendar is also the architecturally
correct source: `INTEGRATION_REGISTRY` lists Calendar as a Phase-1 ⬌ integration
owned by **BookingAgent**, and `booking.external_calendar_event_id` exists
precisely to map calendar events → bookings.

This is also the first real **cutover** lever (HABIT_DESIGN two-system trap):
once "who's next" is live and accurate in Lens, the daily reason to open the
Calendar tab weakens.

## What already exists (substrate — do NOT rebuild)

- `integration_credentials` table: encrypted token storage
  (`access_token_ciphertext bytea`, `refresh_token_ciphertext`, `key_version`,
  `expires_at`, `scope[]`, `unique(photographer_id, service)`), RLS enabled.
  `service` CHECK already includes `'calendar'`.
- `src/lib/crypto/tokens.ts` — token encryption at rest (has tests).
- `booking` table + `src/lib/erp/booking/` ERP module (getBooking, listBookings,
  createBooking). Has `session_date`, `status`, `external_calendar_event_id`.
- Env: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `TOKEN_ENCRYPTION_KEY`.
- **Missing:** `src/lib/integrations/` does not exist yet.

## Sub-PRs (build in order)

### LENS-021a — Google OAuth connect flow (Calendar scope)
Consent → callback → encrypt tokens via `crypto/tokens` → upsert into
`integration_credentials` (service `'calendar'`). Include token **refresh** using
the stored refresh token + `expires_at`. A "Connect Google Calendar" entry point
in settings/onboarding.
- **Security-sensitive (OAuth + token crypto): test file in the SAME PR**
  (anti-pattern #33). Cover: token encrypt/decrypt round-trip, refresh-on-expiry,
  and that plaintext tokens are never logged (anti-pattern #11).
- No new table (integration_credentials exists). Verify it has RLS policies for
  insert/update, not just select — **may need a small migration** if update/insert
  policies are missing.

### LENS-021b — Calendar read adapter
`src/lib/integrations/calendar/client.ts` — the **only** file allowed to import
the Google Calendar SDK (anti-pattern #4). Function: list events in a date window
for the connected photographer. Handles token refresh via 021a. Zod-validate the
external payload at the boundary.

### LENS-021c — Sync calendar events → bookings
One-way pull (Calendar → ERP) for the MVP. For each event in the window, match to
a `client` (by attendee email, falling back to title/name heuristics) and upsert a
`booking` keyed by `external_calendar_event_id`. **Unmatched events must be
surfaced, not silently dropped** (Rule 4 / DECISIONS_LOG honesty). BookingAgent
territory — coordinate per AGENT_ARCHITECTURE, no direct agent-to-agent calls.
- Decision to make at build time: sync-on-load vs. scheduled sync vs. webhook.
  Recommend scheduled/on-load pull first; push + webhooks later.

### LENS-021d — Wire the dashboard "who's next" card
Add `listUpcomingBookings(supabase)` to the booking ERP module (session_date >=
today, status in confirmed/tentative, soonest first, join client for name). Wire
the dashboard's **"Today's shoots" / "On track"** sections in `mission-control.tsx`
to real bookings; delete the corresponding `DATA.*` mock. Rule 4: show "syncing…"
/ honest-empty when Calendar isn't connected or no upcoming shoots — never
fabricated rows.

## Accuracy is a release gate (Rule 4)

"Who's next" is a P0-accuracy surface. Before release, upcoming-shoot data must
reconcile with the source calendar. A shoot that doesn't appear, or a cancelled
event still showing, is a P0 bug. Prefer "syncing…" over stale-but-confident.

## Out of scope
- "Who owes" / invoice + payment schema → **LENS-022** (migration → Stripe).
- Two-way sync / writing bookings back to Calendar → later.

## Gates
- Integration SDK only inside `src/lib/integrations/calendar/` (anti-pattern #4).
- OAuth/crypto PRs ship with tests (anti-pattern #33); never log tokens (#11).
- Any new/changed table: RLS + photographer-scoped policy in the same migration.
- Zod-validate external Calendar payloads at the boundary.
- `data-testid` on interactive elements; `tsc` + lint clean.
