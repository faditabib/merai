-- Build 6B.2: Caption Studio — brand-aware caption presets.
--
--  * exports.caption_config — nullable jsonb SNAPSHOT of the resolved caption
--    spec (validated against @merai/core captionStyleSpecSchema). Null = use
--    the caption_style token path, byte-identical to pre-6B.2. This is the
--    channel that lets brand-colored presets render without touching the EDL,
--    mirroring the exports.brand snapshot from 6B.1.
--
--  * Drop the brand_kits.caption_style_default CHECK. The Caption Studio adds
--    built-in tokens (and will add more), and a token-enumerating CHECK forces
--    a migration every time. The column is cosmetic; the app validates it with
--    a zod enum that falls back to the default for anything unknown
--    (brandKitRowSchema .catch()), so the CHECK earns nothing but churn.

alter table public.exports
  add column if not exists caption_config jsonb;

alter table public.brand_kits
  drop constraint if exists brand_kits_caption_style_default_check;
