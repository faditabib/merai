# Build 6B.3 Report — Caption Studio UX

Date: 2026-07-12 · 144 tests green (65 core + 67 worker + 12 web; was 141) ·
`next build` ✓ · ar/en parity 330 = 330 · migration 11 written. Analysis:
[BUILD_6B_3_ANALYSIS.md](BUILD_6B_3_ANALYSIS.md).

Turns the caption system from developer tokens into a creator-facing **Caption
Studio** — a named preset gallery, a live preview with controls, brand
integration, a single default preference, and an export "your video style"
card. All within the hard constraints: **no EDL, no AI Brain, no
render-architecture change, no saved preset library.**

## 1. What was built

### Preset gallery (8 creator presets)
`CAPTION_PRESETS` in core: **Viral, Podcast, Educational, Medical, Luxury,
Minimal, High Energy, Professional** — each with a real `CaptionStyleSpec`, an
animation label, and a use-case. Their ids are added to the resolvable spec
map; the pre-6B.3 developer tokens stay resolvable (backward compatible) but
are hidden from the gallery. Each card shows a live thumbnail, name, animation
chip, and best-use line.

### One shared preview renderer (preview = export)
`CaptionPreview` + `captionSpanStyle`
([caption-preview.tsx](apps/web/src/components/caption-preview.tsx)) mirror the
server rasterizer's fields (color, box, outline, scale, anchor). The gallery
thumbnails, the live preview, and the editor overlay all render through it, so
what the creator sees is structurally what the worker draws.

### Live controls
[caption-studio.tsx](apps/web/src/components/caption-studio.tsx): **position**
(top/center/bottom), **font scale**, **text color** or **use my brand colors**,
**outline**, and **background box** — all mutating one working spec, previewed
live. Reused on the Brand Kit page (full) and in the editor (compact).

### Brand integration
When a Brand Kit exists, the studio shows a "use my brand colors" control and
previews brand-* presets in the creator's real colors; the resolved spec is
snapshotted at export.

### Default preference ("Set as default")
Migration 11 adds **`brand_kits.caption_default_config jsonb`** — the creator's
**single** default caption spec (a preference, explicitly not a preset
library). The Brand Kit form persists it (+ `caption_style_default` token); the
editor initializes its working spec from it.

### Export "your video style" card
The export panel shows a compact card before rendering: **Caption** (preset
name), **Brand** (kit name + a color word from `hueName`, with a swatch), and
**Format** (aspect). The working caption spec — with studio tweaks and brand
color — is snapshotted to `exports.caption_config` (the 6B.2 channel).

## 2. Architecture decisions
1. **UX-only + one nullable column.** The worker is **untouched** — it already
   resolves `caption_config ?? token` and honors outline/scale/colors (6B.2).
   6B.3 is web + core-data + `caption_default_config`.
2. **One shared caption renderer** guarantees preview/export consistency by
   construction (the spec the preview styles is the spec the worker rasterizes).
3. **Animation is a label, not motion.** The render pipeline stays one static
   PNG per line; the animation chip communicates feel. Animated/karaoke export
   remains deferred (needs render architecture — gap G1 from 6B.2).
4. **Default is a preference, not a library.** A single `caption_default_config`
   per creator; no named-preset table (that's a later build).
5. **`CaptionStyleSpec.token` widened to `string`** so persisted/snapshotted
   specs are structurally assignable; the built-in `CAPTION_STYLE_SPECS` keys
   stay strongly typed.

## 3. Database (migration 11 — `20260712180000_caption_default_config.sql`)
- `brand_kits.caption_default_config jsonb` (nullable; null = the
  `caption_style_default` token path). Owner scoping via the existing
  brand_kits RLS. Additive — no backfill, no policy change.

## 4. Tests (141 → 144)
- **Core (+3)** — the 8-preset catalog resolves + schema-validates and matches
  the id order; pre-6B.3 developer tokens stay resolvable and preset ids are
  additive union members; `hueName` maps representative hexes to color words.
- Worker/web suites unchanged and green (the worker path is the proven 6B.2
  `caption_config` code).

## 5. Verification
- 144 tests green; `tsc` clean across core/worker/web; `next build` ✓.
- ar/en parity 330 = 330 (Arabic authored first).
- Preview/export consistency is structural (one shared renderer) and
  frame-verified in production (below).

## 6. Mobile & RTL
- Gallery grid `grid-cols-2` → `sm:3` → `lg:4`; preview + controls stack on
  mobile, split on desktop. Logical utilities only (`ms/ps/text-start`);
  `dir="ltr"` only on the numeric aspect + range inputs. Caption text is
  Arabic-shaped (Skia + DOM).

## 7. Backward compatibility
- `caption_default_config = null` AND `caption_config = null` ⇒ identical to
  pre-6B.3. Old developer tokens resolve; new preset ids are additive. EDL, AI
  Brain, and the worker render pipeline are unchanged.

## 8. Deferred (documented)
- **Saved custom preset library** (many named presets).
- **Animated / karaoke caption export** (render architecture).
- **Auto keyword highlighting** (AI Brain).
- **Per-video persisted styling in the EDL** / **custom fonts**.

## 9. Production — deployed & verified (2026-07-12)
- **Migration 11 applied live** (`caption_default_config` present).
- **Vercel web deployed**; the **worker was not redeployed** (unchanged — it
  already renders `caption_config`).
- **Live E2E through the deployed worker** frame-verified a studio caption
  (see the production section appended below).
