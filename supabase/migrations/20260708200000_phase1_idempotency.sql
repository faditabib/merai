-- ============================================================================
-- Phase 1 — idempotency constraints for the transcription pipeline
-- Safe to re-run: every statement is IF (NOT) EXISTS-guarded.
-- ============================================================================

-- One transcript per upload: lets the transcribe handler upsert by upload_id
-- and makes job retries converge instead of duplicating rows.
drop index if exists public.transcripts_upload_idx;
create unique index if not exists transcripts_upload_uidx
  on public.transcripts (upload_id);

-- One raw_minutes ledger row per upload: usage metering is idempotent across
-- retries. NULL upload_id rows (export metering) remain unconstrained.
create unique index if not exists usage_ledger_upload_uidx
  on public.usage_ledger (upload_id);
