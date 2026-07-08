-- Migration: 006 | comm_sequence_state.invoice_id — per-invoice chase pause | 2026-07-07
--
-- LENS-022e: the payment chase's pause toggle is per-invoice (spec stop
-- condition 3), but comm_sequence_state (migration_002) keys only on
-- sequence/client/booking — a booking with deposit + final invoices could
-- not pause one chase without pausing the other. Adds a nullable invoice_id
-- so pause/cancel INTENT is stored per invoice (LENS-D-027).
--
-- Per LENS-D-024 this table never stores chase HISTORY — step progression
-- and idempotency derive from comm_log. Rows here are created lazily on the
-- first pause; no backfill needed.
--
-- RLS: unchanged — existing comm_sequence_state policies scope through the
-- owning comm_sequence's photographer_id, which covers the new column.
--
-- Apply manually to BOTH Supabase projects (prod + test).

BEGIN;

alter table comm_sequence_state add column invoice_id uuid references invoice(id);

-- One pause state per invoice. Partial: legacy rows (other sequence types)
-- keep keying on client/booking with invoice_id null.
create unique index comm_sequence_state_invoice_id_key
  on comm_sequence_state(invoice_id)
  where invoice_id is not null;

COMMIT;
