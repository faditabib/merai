# Build 6B.1 Report — Creator Identity Layer

Date: 2026-07-11 · 129 tests green (56 core + 61 worker + 12 web; was 113) ·
`next build` ✓ · ar/en key parity 274 = 274 · migration 9 written (not yet
applied live). Analysis that framed this phase:
[BUILD_6B_PRODUCTIZATION_ANALYSIS.md](BUILD_6B_PRODUCTIZATION_ANALYSIS.md).
Backend foundation was committed first (`0ca6b47`); this build finishes the
web integration, i18n, tests, and docs.

Turns Merai from "AI video editor" into "AI video editor that creates
content in the creator's brand identity" — the three foundations only
(Brand Kit, caption presets, brand overlays). No dashboard redesign, no
recording, no publishing, no marketplace, no music.

## 1. What was built

### Brand Kit (creator identity)
- **`brand_kits` table** — one kit per creator (unique `owner_id`): name,
  logo path, three brand colors, default caption preset, gradient-overlay
  defaults, lower-third defaults. Owner-only RLS, hex `CHECK` constraints,
  the standard `set_updated_at` trigger.
- **`BrandKitForm`** ([brand-kit-form.tsx](apps/web/src/components/brand-kit-form.tsx)) —
  colors (native swatches with hex readout), logo upload to the private
  `brand-assets` bucket, default-preset picker, gradient sliders, lower-third
  fields, and a **live preview** frame showing gradient + lower third +
  caption sample. RTL-safe (logical utilities only).
- **Brand Kit route** ([dashboard/brand-kit/page.tsx](apps/web/src/app/[locale]/dashboard/brand-kit/page.tsx)) —
  server component: auth-guard, owner-scoped kit load, signed logo URL,
  error state on load failure, fresh-form empty state when no kit exists.
- **Nav entry** — a "Brand Kit / الهوية البصرية" link in the shared header.

### Caption Studio (visual preset system)
- **New `professional-clean` preset** — premium low placement, no box, for
  doctors/founders/educators. Added as a fourth `CAPTION_STYLE_TOKEN` with a
  spec; the picker, the editor overlay, and the server rasterizer all pick it
  up with no per-surface code.
- **`CaptionStylePicker`** ([caption-style-picker.tsx](apps/web/src/components/caption-style-picker.tsx)) —
  a visual selector: each option is a miniature video frame rendered with the
  preset's real color/weight/placement, so creators pick by look. Used in the
  editor (replacing the old text buttons) and in the Brand Kit form.
- **Persisted with the export** — caption style already rides the EDL through
  the saved version into `exports.caption_style`; the picker feeds the same
  `set-caption-style` command, so nothing new is needed to persist it.

### Brand overlays (rendering foundation)
- **Layer model** (binding): `video → gradient overlay → captions → lower
  third`. The gradient is a readability layer UNDER captions; the lower third
  sits ON TOP.
- **Gradient overlay** — a bottom transparent→dark band (opacity + height
  configurable), improves caption legibility on vertical video.
- **Lower third** — static name + optional title/subtitle over a brand accent
  bar; RTL-aware anchoring (Arabic names anchor right, Latin left).
- **Rasterizer** ([render/brand.ts](apps/worker/src/render/brand.ts)) — same
  Skia+HarfBuzz canvas the captions use; brand PNGs ride alongside caption
  images, so **neither render engine changed**.

### Export flow
- **Branding control in the export panel** — "Apply my branding to this
  video" checkbox when a kit exists, or a "Create your Brand Kit" prompt when
  it doesn't. On export the branding is **snapshotted** into `exports.brand`.

## 2. Architecture decisions

1. **Branding is an export-row snapshot, not an EDL field.** `downgradeEdlV2ToV1`
   refuses `has-effects`, so brand overlays riding EDL v2 effects would
   permanent-fail every branded export until the renderer learns tracks. The
   snapshot on `exports.brand` (validated by `brandExportConfigSchema`) keeps
   old projects and kit-less exports byte-identical, and — like
   `aspect_ratio`/`caption_style` already do — means a later Brand Kit edit
   never changes a render that already happened.
2. **Brand layers ride the caption image channel.** Both render engines
   (local ffmpeg + VeryGoodFFmpeg) stage `captionImages` generically, so
   appending brand PNGs needed zero engine changes; the compositing lives
   entirely in the pure, unit-tested `buildExportPlan`.
3. **One kit per creator.** `unique(owner_id)` and an upsert on conflict —
   right-sized; multi-brand orgs are a later concern.
4. **Malformed branding fails loud.** An invalid `exports.brand` is a
   `PermanentJobError` (no retry burn), never a silent unbranded render — the
   creator's branding is not something to quietly drop.
5. **Logo stored, not yet composited.** The lower third renders text + accent
   bar in this foundation; the logo is captured in the kit and previewed, but
   compositing it into the frame is deferred (documented below).

## 3. Database changes (migration 9 — `20260711200000_brand_kits.sql`)
- `brand_kits` (owner-unique, owner-only RLS: read/insert/update/delete).
- `exports.brand jsonb` (nullable; null = unbranded).
- `brand-assets` private storage bucket + owner-namespaced object policies.
- **Not yet applied to the live database** — apply before/with deploy.

## 4. Tests (113 → 129)
- **Core (+9)** — brand config serialization (defaults, JSON round-trip,
  malformed-color/opacity rejection); `buildExportPlan` brand layers:
  unbranded plan byte-identical whether `brand` is absent or null, gradient
  composited UNDER captions and lower third ON TOP (input-index + order
  asserted), gradient-only kit, lower-third over a caption-less segment.
- **Worker (+7)** — render handler stages both brand PNGs for a branded
  export, stages nothing for an unbranded one (backward compat), and
  permanent-fails a malformed brand snapshot; **brand_kits RLS** under
  `set role authenticated`: owner CRUD, foreign insert rejected, stranger
  can't see or mutate the owner's kit, one-kit-per-creator uniqueness.

## 5. Verification
- 129 tests green; `tsc --noEmit` clean across core/worker/web.
- `next build` ✓ — the `/[locale]/dashboard/brand-kit` route compiles and
  registers.
- ar/en key parity: 274 = 274 (jq-style key diff), Arabic authored first.
- **Pre-existing lint:** 6 `eslint-config-next` react-hooks errors exist in
  files this build didn't change (`ai-assistant-panel`, `project-status-view`,
  and the export-panel poll effect — line-shifted, same construct as on HEAD).
  Not a regression; the house gate is `next build` + tests.

## 6. Deferred (deliberately)
- **Logo compositing** into the lower third (stored + previewed; not drawn in
  the render yet).
- **Animation** of overlays/lower thirds (static for the whole clip now — this
  is the config/rendering foundation).
- **AI-aware preset suggestion** by content type; per-video preset mix.
- **Export preview** (browser-side branded 3s clip) and the share receipt.
- **Dashboard redesign**, onboarding wizard, per-platform export profiles.
- Explicitly out of 6B.1: Caption Studio 2.0, Overlay Studio, recording,
  teleprompter.

## 7. Production impact
- **Zero** for existing projects: no branding = null `exports.brand` = the
  pre-6B.1 plan, byte-identical (regression-tested both in core and worker).
- Migration 9 is additive (new table, nullable column, new bucket) — no
  change to any existing row or policy.

## 8. Not done in this session (needs owner action)
- **Live deploy** (Vercel web + Railway worker) and **applying migration 9**
  to the production database — these need the owner's credentials.
- **Live E2E** (upload → AI → editor → Brand Kit → branded export → download,
  verifying gradient + lower third + captions render and that an unbranded
  export still works) — runs against the deployed environment and a
  logged-in session, so it follows the deploy. This is the first item for the
  next live session, mirroring how Build 5/6A flagged the browser pass.
