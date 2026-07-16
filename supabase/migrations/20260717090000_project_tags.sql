-- Build 7.7 — Project organization: tags are the organization primitive
-- (a "collection" is a tag filter, not a container row). Additive and
-- idempotent; owner-update RLS already covers writes.

alter table public.projects
  add column if not exists tags text[] not null default '{}';

-- Future server-side tag filtering; cheap to carry now.
create index if not exists projects_tags_idx
  on public.projects using gin (tags);
