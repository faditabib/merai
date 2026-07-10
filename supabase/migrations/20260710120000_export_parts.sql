-- Download fallback for outputs over the storage per-file cap: the worker
-- stores them as "{owner_id}/{export_id}.mp4.partN" objects (N = 0..parts-1)
-- and the browser reassembles one file on download. storage_path keeps the
-- logical single-file path; `parts` = 1 means one real object at that path.

alter table public.exports
  add column if not exists parts integer not null default 1 check (parts >= 1);
