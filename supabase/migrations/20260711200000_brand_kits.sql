-- Build 6B.1: Creator Identity Layer — Brand Kit + branded exports.
--
--  * brand_kits — one kit per creator (unique owner_id): colors, logo,
--    default caption style, overlay/lower-third defaults. Owner-only RLS,
--    same tenancy pattern as every user-owned table.
--  * exports.brand — nullable jsonb SNAPSHOT of the branding the user chose
--    at export time (validated against @merai/core brandExportConfigSchema).
--    Null = unbranded, renders byte-identical to pre-6B.1. Snapshot (not a
--    join) so later kit edits never change an export that already happened —
--    the same semantics aspect_ratio/caption_style already have.
--  * brand-assets — private storage bucket for logos, owner-namespaced paths.

create table public.brand_kits (
  id                    uuid primary key default gen_random_uuid(),
  owner_id              uuid not null unique references public.profiles (id) on delete cascade,
  name                  text not null default '',
  -- Storage path in the brand-assets bucket ({owner_id}/logo.<ext>);
  -- access is via signed URLs only (house rule: no public buckets).
  logo_path             text,
  primary_color         text not null default '#7C3AED'
                        check (primary_color ~ '^#[0-9a-fA-F]{6}$'),
  secondary_color       text not null default '#0EA5E9'
                        check (secondary_color ~ '^#[0-9a-fA-F]{6}$'),
  accent_color          text not null default '#F59E0B'
                        check (accent_color ~ '^#[0-9a-fA-F]{6}$'),
  caption_style_default text not null default 'minimal-white-bottom'
                        check (caption_style_default in
                          ('bold-yellow-centered', 'minimal-white-bottom',
                           'karaoke-highlight', 'professional-clean')),
  -- Gradient readability overlay defaults ({opacity, heightPct, color}).
  overlay_default       jsonb,
  -- Lower-third defaults ({name, title?, subtitle?, accentColor, textColor}).
  lower_third_default   jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create trigger brand_kits_set_updated_at
  before update on public.brand_kits
  for each row execute function public.set_updated_at();

alter table public.brand_kits enable row level security;

create policy "brand_kits: own read"
  on public.brand_kits for select using (owner_id = auth.uid());
create policy "brand_kits: own insert"
  on public.brand_kits for insert with check (owner_id = auth.uid());
create policy "brand_kits: own update"
  on public.brand_kits for update
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "brand_kits: own delete"
  on public.brand_kits for delete using (owner_id = auth.uid());

-- Branding snapshot on exports (null = unbranded, pre-6B.1 behavior).
alter table public.exports
  add column if not exists brand jsonb;

-- Logos: private bucket, owner-namespaced ({owner_id}/...), signed URLs only.
insert into storage.buckets (id, name, public)
values ('brand-assets', 'brand-assets', false)
on conflict (id) do nothing;

create policy "brand-assets: own read" on storage.objects for select to authenticated
  using (bucket_id = 'brand-assets' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "brand-assets: own insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'brand-assets' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "brand-assets: own update" on storage.objects for update to authenticated
  using (bucket_id = 'brand-assets' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "brand-assets: own delete" on storage.objects for delete to authenticated
  using (bucket_id = 'brand-assets' and (storage.foldername(name))[1] = auth.uid()::text);
