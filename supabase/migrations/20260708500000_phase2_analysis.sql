-- ============================================================================
-- Phase 2 — persist AI analysis on the transcript
-- Safe to re-run (IF NOT EXISTS-guarded).
--
-- The Haiku analysis result is stored so EDL regeneration (user tweaks
-- thresholds, retries, future features) never re-bills the model — same
-- cost principle as keeping transcripts.raw for STT.
-- ============================================================================

alter table public.transcripts
  add column if not exists analysis jsonb;
