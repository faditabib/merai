-- Build 6B.3: Caption Studio UX — a single default caption preference.
--
--  * brand_kits.caption_default_config — nullable jsonb holding the creator's
--    ONE default caption spec crafted in the Caption Studio (validated against
--    @merai/core captionStyleSpecSchema). This is a default PREFERENCE, not a
--    saved-preset library: exactly one config per creator. Null = fall back to
--    the caption_style_default token → byte-identical to pre-6B.3.
--
-- Owner scoping is already enforced by the existing brand_kits RLS policies;
-- this is an additive nullable column, so no policy or backfill is needed.

alter table public.brand_kits
  add column if not exists caption_default_config jsonb;
