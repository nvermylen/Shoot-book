-- Migration: 003 | source_message_id column + unique index | 2026-06-22
-- Closes D-019: replaces the [lens:src_msg_id=...] sentinel in intent_summary
-- with a proper column and partial unique index for dedup enforcement.
--
-- Deployment sequencing: apply this migration BEFORE merging the code cutover.
-- Old code does not reference this column, so the new schema is harmless to it.
--
-- Pre-apply verification (run as SELECT, not UPDATE, against production):
--   SELECT id, intent_summary,
--     substring(intent_summary from E'\\n\\n\\[lens:src_msg_id=([^\\]]+)\\]$')
--   FROM lead
--   WHERE intent_summary LIKE '%[lens:src_msg_id=%';
--
--   SELECT source_message_id, photographer_id, count(*)
--   FROM lead
--   WHERE source_message_id IS NOT NULL
--   GROUP BY photographer_id, source_message_id
--   HAVING count(*) > 1;

BEGIN;

-- Step 1: Add column — nullable permanently.
-- null = lead predates message-sourcing, a valid state, not a defect. Do not tighten to NOT NULL.
-- IF NOT EXISTS for idempotent re-run if step 3 halts and runner doesn't roll back DDL.
ALTER TABLE lead ADD COLUMN IF NOT EXISTS source_message_id TEXT;

-- Step 2: Backfill — extract <id> from the sentinel tail into the new column.
-- Pattern: \n\n[lens:src_msg_id=<id>] anchored to end-of-string.
-- Capture group: everything between = and ] (non-] chars only).
UPDATE lead
SET source_message_id = substring(intent_summary from E'\\n\\n\\[lens:src_msg_id=([^\\]]+)\\]$')
WHERE intent_summary LIKE '%[lens:src_msg_id=%'
  AND source_message_id IS NULL;

-- Step 3: Pre-flight duplicate check — halt if collisions exist.
-- A collision means two leads for the same photographer claim the same source message.
-- This requires human inspection, not auto-resolution (#37 one layer down).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM lead
    WHERE source_message_id IS NOT NULL
    GROUP BY photographer_id, source_message_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate source_message_id detected — inspect colliding rows before proceeding. Run: SELECT photographer_id, source_message_id, count(*) FROM lead WHERE source_message_id IS NOT NULL GROUP BY photographer_id, source_message_id HAVING count(*) > 1;';
  END IF;
END $$;

-- Step 4a: Strip the sentinel tail from intent_summary.
-- Uses the identical pattern as step 2 — same anchor, same boundary.
-- Scoped to rows where extraction matched (source_message_id IS NOT NULL after step 2).
UPDATE lead
SET intent_summary = regexp_replace(
  intent_summary,
  E'\\n\\n\\[lens:src_msg_id=[^\\]]+\\]$',
  ''
)
WHERE source_message_id IS NOT NULL
  AND intent_summary LIKE '%[lens:src_msg_id=%';

-- Step 4b: Partial unique index — only rows with a source_message_id participate.
-- Null-sourced legacy leads don't collide (they have no message ID to conflict on).
CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_photographer_source_msg
  ON lead (photographer_id, source_message_id)
  WHERE source_message_id IS NOT NULL;

COMMIT;
