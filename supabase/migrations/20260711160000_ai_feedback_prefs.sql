-- Build 5.6: AI Brain UX polish — per-command presentation steps, creator
-- feedback, and explicit (never hidden) intent preference.

-- Presentation metadata parallel to commands (index-aligned; commands stay
-- pure dispatcher input), plus lightweight per-suggestion feedback. The
-- existing owner-update RLS policy covers feedback writes.
alter table public.ai_suggestions
  add column steps jsonb,
  add column feedback text
    check (feedback in ('helpful', 'not-useful')),
  add column feedback_reason text
    check (feedback_reason in
      ('prefer-original', 'misunderstood-context', 'wrong-cut', 'other'));

-- Explicit creator intent. Only the user's own choice is ever stored;
-- 'auto' means the worker derives a hint per-request from the user's
-- applied suggestions and stores nothing (privacy: no hidden profile).
create table public.ai_preferences (
  owner_id   uuid primary key references public.profiles (id) on delete cascade,
  intent     text not null default 'auto'
             check (intent in ('auto', 'short-form', 'educational', 'general')),
  updated_at timestamptz not null default now()
);

create trigger ai_preferences_set_updated_at
  before update on public.ai_preferences
  for each row execute function public.set_updated_at();

alter table public.ai_preferences enable row level security;

create policy "ai_preferences: own read"
  on public.ai_preferences for select using (owner_id = auth.uid());
create policy "ai_preferences: own insert"
  on public.ai_preferences for insert with check (owner_id = auth.uid());
create policy "ai_preferences: own update"
  on public.ai_preferences for update
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
