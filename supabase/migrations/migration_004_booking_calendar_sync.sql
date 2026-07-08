-- Migration: 004 | booking calendar-sync support | 2026-07-05
--
-- LENS-021c: bookings can now originate from Google Calendar sync.
--
-- 1) package_id becomes nullable: a calendar-imported booking doesn't know its
--    package yet — that's assigned later in Lens. A null package is a visible
--    "needs attention" state (see ERP_DATA_MODEL.md), never silently defaulted.
--
-- 2) external_calendar_event_id gets a partial unique index per photographer:
--    makes sync idempotent (re-sync updates, never duplicates). Partial —
--    Lens-native bookings (null event id) are unaffected.

alter table booking alter column package_id drop not null;

create unique index booking_photographer_external_event_key
  on booking(photographer_id, external_calendar_event_id)
  where external_calendar_event_id is not null;
