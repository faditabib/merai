-- ============================================================================
-- Merai — initial schema
-- Arabic-first AI video editing platform.
--
-- Conventions:
--  * All user-owned tables carry owner_id and are protected by RLS.
--  * Status/enum-like columns use text + CHECK constraints (cheaper to evolve
--    than Postgres enums; see DECISIONS.md).
--  * The jobs table is a Postgres-backed queue consumed by the Railway worker
--    over a direct connection (service role). Users get read-only job status.
--  * Storage: private buckets only; objects are namespaced by owner uuid as
--    the first path segment, enforced in storage.objects policies.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- Helpers
-- ----------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- profiles — 1:1 with auth.users, created by trigger on signup
-- ----------------------------------------------------------------------------

create table public.profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  display_name      text,
  locale            text not null default 'ar'
                    check (locale in ('ar', 'en')),
  subscription_tier text not null default 'starter'
                    check (subscription_tier in ('starter', 'creator', 'pro')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
security definer
set search_path = ''
language plpgsql
as $$
begin
  insert into public.profiles (id, display_name, locale)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'locale', 'ar')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- projects
-- ----------------------------------------------------------------------------

create table public.projects (
  id                   uuid primary key default gen_random_uuid(),
  owner_id             uuid not null references public.profiles (id) on delete cascade,
  title                text not null,
  status               text not null default 'draft'
                       check (status in ('draft', 'uploading', 'transcribing', 'analyzing', 'ready', 'error')),
  source_language      text not null default 'auto'
                       check (source_language in ('ar', 'en', 'auto')),
  default_aspect_ratio text not null default '9:16'
                       check (default_aspect_ratio in ('9:16', '1:1', '16:9')),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index projects_owner_idx on public.projects (owner_id, created_at desc);

create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- video_uploads — raw footage. Hard product cap: 10 minutes per file.
-- Raw footage expires 30 days after upload (margin decision; see DECISIONS.md).
-- ----------------------------------------------------------------------------

create table public.video_uploads (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references public.projects (id) on delete cascade,
  owner_id          uuid not null references public.profiles (id) on delete cascade,
  storage_path      text not null unique,  -- raw-uploads/{owner_id}/{upload_id}/original.<ext>
  original_filename text not null,
  mime_type         text not null,
  size_bytes        bigint,
  duration_seconds  numeric
                    check (duration_seconds is null or (duration_seconds > 0 and duration_seconds <= 600)),
  status            text not null default 'pending'
                    check (status in ('pending', 'uploading', 'uploaded', 'failed', 'expired')),
  error             text,
  expires_at        timestamptz not null default (now() + interval '30 days'),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index video_uploads_project_idx on public.video_uploads (project_id);
create index video_uploads_owner_idx on public.video_uploads (owner_id, created_at desc);
create index video_uploads_expiry_idx on public.video_uploads (expires_at) where status = 'uploaded';

create trigger video_uploads_set_updated_at
  before update on public.video_uploads
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- transcripts — STT output with word-level timestamps
-- words jsonb shape (documented in @merai/core):
--   [{ "id": "w0", "text": "...", "start_ms": 0, "end_ms": 240, "confidence": 0.98, "speaker": "A" }]
-- ----------------------------------------------------------------------------

create table public.transcripts (
  id                     uuid primary key default gen_random_uuid(),
  upload_id              uuid not null references public.video_uploads (id) on delete cascade,
  project_id             uuid not null references public.projects (id) on delete cascade,
  owner_id               uuid not null references public.profiles (id) on delete cascade,
  provider               text not null default 'assemblyai',
  provider_transcript_id text,
  language_code          text,
  status                 text not null default 'pending'
                         check (status in ('pending', 'processing', 'completed', 'failed')),
  text                   text,
  words                  jsonb,
  raw                    jsonb,  -- full provider payload, kept for re-analysis without re-billing STT
  error                  text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index transcripts_upload_idx on public.transcripts (upload_id);
create index transcripts_project_idx on public.transcripts (project_id);

create trigger transcripts_set_updated_at
  before update on public.transcripts
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- edl_versions — immutable, append-only edit decision lists.
-- version 1 is the AI first draft; user edits append new versions.
-- ----------------------------------------------------------------------------

create table public.edl_versions (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  owner_id   uuid not null references public.profiles (id) on delete cascade,
  version    integer not null check (version >= 1),
  source     text not null check (source in ('ai', 'user')),
  edl        jsonb not null,  -- EDL v1, validated against @merai/core zod schema
  created_at timestamptz not null default now(),
  unique (project_id, version)
);

create index edl_versions_project_idx on public.edl_versions (project_id, version desc);

-- ----------------------------------------------------------------------------
-- exports — final rendered videos (rendered client-side via ffmpeg.wasm,
-- then uploaded to the exports bucket for re-download)
-- ----------------------------------------------------------------------------

create table public.exports (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references public.projects (id) on delete cascade,
  owner_id         uuid not null references public.profiles (id) on delete cascade,
  edl_version_id   uuid not null references public.edl_versions (id) on delete cascade,
  aspect_ratio     text not null check (aspect_ratio in ('9:16', '1:1', '16:9')),
  caption_style    text not null default 'minimal-white-bottom',
  storage_path     text unique,  -- exports/{owner_id}/{export_id}.mp4
  status           text not null default 'pending'
                   check (status in ('pending', 'rendering', 'uploaded', 'failed', 'expired')),
  duration_seconds numeric,
  size_bytes       bigint,
  error            text,
  expires_at       timestamptz not null default (now() + interval '90 days'),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index exports_project_idx on public.exports (project_id, created_at desc);
create index exports_owner_idx on public.exports (owner_id, created_at desc);

create trigger exports_set_updated_at
  before update on public.exports
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- usage_ledger — append-only metering. STT cost is billed against RAW footage
-- minutes, so a ledger row is written when an upload finishes, keyed to the
-- UTC month it lands in. Tier enforcement reads SUM(minutes) per period.
-- ----------------------------------------------------------------------------

create table public.usage_ledger (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references public.profiles (id) on delete cascade,
  kind           text not null check (kind in ('raw_minutes', 'export_minutes')),
  minutes        numeric not null check (minutes >= 0),
  upload_id      uuid references public.video_uploads (id) on delete set null,
  export_id      uuid references public.exports (id) on delete set null,
  billing_period date not null,  -- first day of the UTC month
  created_at     timestamptz not null default now()
);

create index usage_ledger_period_idx on public.usage_ledger (owner_id, billing_period, kind);

-- ----------------------------------------------------------------------------
-- jobs — Postgres-backed queue (FOR UPDATE SKIP LOCKED), consumed by the
-- Railway worker. No external queue infra; see DECISIONS.md.
-- ----------------------------------------------------------------------------

create table public.jobs (
  id           uuid primary key default gen_random_uuid(),
  type         text not null,     -- 'transcribe' | 'analyze' | 'generate_edl' | 'cleanup_expired' | ...
  payload      jsonb not null default '{}'::jsonb,
  status       text not null default 'queued'
               check (status in ('queued', 'processing', 'done', 'failed')),
  attempts     integer not null default 0,
  max_attempts integer not null default 3,
  run_at       timestamptz not null default now(),
  locked_at    timestamptz,
  locked_by    text,
  last_error   text,
  dedupe_key   text unique,       -- idempotency: e.g. 'transcribe:{upload_id}'
  owner_id     uuid references public.profiles (id) on delete cascade,
  project_id   uuid references public.projects (id) on delete cascade,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index jobs_queued_idx on public.jobs (run_at, created_at) where status = 'queued';
create index jobs_project_idx on public.jobs (project_id) where project_id is not null;

create trigger jobs_set_updated_at
  before update on public.jobs
  for each row execute function public.set_updated_at();

-- Claim the next runnable job atomically. Called only by the worker
-- (direct connection / service role); execute is revoked from client roles.
create or replace function public.claim_next_job(p_worker_id text, p_types text[] default null)
returns public.jobs
language plpgsql
as $$
declare
  v_job public.jobs;
begin
  select * into v_job
  from public.jobs
  where status = 'queued'
    and run_at <= now()
    and (p_types is null or type = any (p_types))
  order by created_at
  limit 1
  for update skip locked;

  if v_job.id is null then
    return null;
  end if;

  update public.jobs
  set status = 'processing',
      attempts = attempts + 1,
      locked_at = now(),
      locked_by = p_worker_id
  where id = v_job.id
  returning * into v_job;

  return v_job;
end;
$$;

create or replace function public.complete_job(p_job_id uuid)
returns void
language sql
as $$
  update public.jobs
  set status = 'done', locked_at = null, locked_by = null, last_error = null
  where id = p_job_id;
$$;

-- Fail with exponential backoff; permanently fail once attempts exhausted.
create or replace function public.fail_job(p_job_id uuid, p_error text)
returns void
language plpgsql
as $$
begin
  update public.jobs
  set status     = case when attempts >= max_attempts then 'failed' else 'queued' end,
      run_at     = case when attempts >= max_attempts then run_at
                        else now() + make_interval(secs => 30 * power(2, attempts)) end,
      locked_at  = null,
      locked_by  = null,
      last_error = p_error
  where id = p_job_id;
end;
$$;

revoke execute on function public.claim_next_job(text, text[]) from public, anon, authenticated;
revoke execute on function public.complete_job(uuid) from public, anon, authenticated;
revoke execute on function public.fail_job(uuid, text) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- Row Level Security — deny by default, owner-scoped access.
-- The worker connects with the service role and bypasses RLS.
-- ----------------------------------------------------------------------------

alter table public.profiles      enable row level security;
alter table public.projects      enable row level security;
alter table public.video_uploads enable row level security;
alter table public.transcripts   enable row level security;
alter table public.edl_versions  enable row level security;
alter table public.exports       enable row level security;
alter table public.usage_ledger  enable row level security;
alter table public.jobs          enable row level security;

-- profiles: user reads/updates own row; creation handled by signup trigger
create policy "profiles: own read"   on public.profiles for select using (id = auth.uid());
create policy "profiles: own update" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- projects: full owner CRUD
create policy "projects: own read"   on public.projects for select using (owner_id = auth.uid());
create policy "projects: own insert" on public.projects for insert with check (owner_id = auth.uid());
create policy "projects: own update" on public.projects for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "projects: own delete" on public.projects for delete using (owner_id = auth.uid());

-- video_uploads: owner CRUD (server-side validation enforces caps before insert)
create policy "uploads: own read"   on public.video_uploads for select using (owner_id = auth.uid());
create policy "uploads: own insert" on public.video_uploads for insert with check (owner_id = auth.uid());
create policy "uploads: own update" on public.video_uploads for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "uploads: own delete" on public.video_uploads for delete using (owner_id = auth.uid());

-- transcripts: read-only for owners; written by the worker (service role)
create policy "transcripts: own read" on public.transcripts for select using (owner_id = auth.uid());

-- edl_versions: owners read and append (user edits create new versions);
-- no update/delete — versions are immutable
create policy "edl: own read"   on public.edl_versions for select using (owner_id = auth.uid());
create policy "edl: own insert" on public.edl_versions for insert with check (owner_id = auth.uid());

-- exports: owner CRUD (client-side renderer writes status/paths)
create policy "exports: own read"   on public.exports for select using (owner_id = auth.uid());
create policy "exports: own insert" on public.exports for insert with check (owner_id = auth.uid());
create policy "exports: own update" on public.exports for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "exports: own delete" on public.exports for delete using (owner_id = auth.uid());

-- usage_ledger: read-only for owners; written server-side only
create policy "usage: own read" on public.usage_ledger for select using (owner_id = auth.uid());

-- jobs: read-only status visibility for owners; mutations are worker/server-only
create policy "jobs: own read" on public.jobs for select using (owner_id = auth.uid());

-- ----------------------------------------------------------------------------
-- Storage — private buckets, owner-namespaced paths ({owner_id}/...)
-- ----------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('raw-uploads', 'raw-uploads', false),
       ('exports', 'exports', false)
on conflict (id) do nothing;

create policy "raw-uploads: own read" on storage.objects for select to authenticated
  using (bucket_id = 'raw-uploads' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "raw-uploads: own insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'raw-uploads' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "raw-uploads: own update" on storage.objects for update to authenticated
  using (bucket_id = 'raw-uploads' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "raw-uploads: own delete" on storage.objects for delete to authenticated
  using (bucket_id = 'raw-uploads' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "exports: own read" on storage.objects for select to authenticated
  using (bucket_id = 'exports' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "exports: own insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'exports' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "exports: own update" on storage.objects for update to authenticated
  using (bucket_id = 'exports' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "exports: own delete" on storage.objects for delete to authenticated
  using (bucket_id = 'exports' and (storage.foldername(name))[1] = auth.uid()::text);
