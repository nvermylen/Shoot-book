-- Migration: 007 | lead.thread_id — Gmail thread linkage for intake | 2026-08-01
--
-- LENS-023b: the intake runner creates leads from Gmail thread-starter
-- messages. The INTEGRATION_REGISTRY threading rule ("Thread IDs are stored
-- on the matching client or lead row to link conversations") assumed this
-- column; nothing created it. Nullable — leads from other sources (web_form,
-- referral, …) have no thread.
--
-- Renumbered from the spec's assumed migration_006: LENS-022e took 006 for
-- comm_sequence_state.invoice_id (see CLAUDE.md build state, 2026-08-01).
--
-- RLS: unchanged — existing lead policies are photographer-scoped and cover
-- the new column.
--
-- Apply manually to BOTH Supabase projects (prod + test).

BEGIN;

alter table lead add column thread_id text;

-- Partial: only Gmail-sourced leads carry a thread; lookups are always
-- per-photographer ("which lead owns this thread?" — the future CommsAgent
-- reply join).
create index lead_thread_id_idx
  on lead(photographer_id, thread_id)
  where thread_id is not null;

COMMIT;
