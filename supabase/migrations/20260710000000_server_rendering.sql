-- ============================================================================
-- Server-side rendering: exports become worker jobs.
-- Safe to re-run (IF EXISTS / IF NOT EXISTS guarded).
--
--  * progress          — 0..1, written by the worker between segments so the
--                        UI can poll a real progress bar.
--  * cancel_requested  — set by the owner (RLS update policy already allows
--                        it); the worker checks it between segments and
--                        finishes the job as 'cancelled'.
--  * status gains 'cancelled'; 'pending' now means "queued, not yet claimed".
-- ============================================================================

alter table public.exports
  add column if not exists progress numeric not null default 0
    check (progress >= 0 and progress <= 1);

alter table public.exports
  add column if not exists cancel_requested boolean not null default false;

alter table public.exports
  drop constraint if exists exports_status_check;

alter table public.exports
  add constraint exports_status_check
  check (status in ('pending', 'rendering', 'uploaded', 'failed', 'expired', 'cancelled'));
