-- Functional Readiness sprint (2026-07-18): project archive state.
-- A separate lifecycle column, NOT a projects.status value — pipeline state
-- (uploading/transcribing/…) and shelf state (archived) are orthogonal, and
-- overloading the status CHECK would conflate them. Additive + idempotent;
-- existing owner-update RLS covers archive/restore writes.

alter table public.projects
  add column if not exists archived_at timestamptz;
