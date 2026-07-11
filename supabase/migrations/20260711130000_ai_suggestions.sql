-- Build 5.5: AI Editing Brain suggestions.
-- The Brain writes ONLY here — the EDL changes exclusively in the editor
-- when the owner applies the validated commands (human in control).

create table public.ai_suggestions (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects (id) on delete cascade,
  owner_id        uuid not null references public.profiles (id) on delete cascade,
  -- The saved EDL version the commands were computed against.
  edl_version_id  uuid not null references public.edl_versions (id) on delete cascade,
  instruction     text not null check (char_length(instruction) between 1 and 500),
  goal            text,
  commands        jsonb,
  explanation     text,
  status          text not null default 'pending'
                  check (status in ('pending','processing','ready','failed','applied','dismissed')),
  error           text,
  model           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index ai_suggestions_project_idx
  on public.ai_suggestions (project_id, created_at desc);

create trigger ai_suggestions_set_updated_at
  before update on public.ai_suggestions
  for each row execute function public.set_updated_at();

alter table public.ai_suggestions enable row level security;

-- Owners create requests and read results; owner updates cover marking a
-- ready suggestion applied/dismissed. The worker writes via the service role.
create policy "ai_suggestions: own read"
  on public.ai_suggestions for select using (owner_id = auth.uid());
create policy "ai_suggestions: own insert"
  on public.ai_suggestions for insert with check (owner_id = auth.uid());
create policy "ai_suggestions: own update"
  on public.ai_suggestions for update
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
