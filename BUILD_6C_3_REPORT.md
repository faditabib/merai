# Build 6C.3 Report — Overlay Studio

Date: 2026-07-12 · 160 tests green (75 core + 73 worker + 12 web) · `next build`
✓ · ar/en parity 384 = 384 · **zero migrations**. Analysis:
[BUILD_6C_3_ANALYSIS.md](BUILD_6C_3_ANALYSIS.md). Third 6C sub-build — the one
with a render change, kept **additive** (no architecture redesign).

Turns the brand layer into a creator-facing **Overlay Studio**: the creator's
**logo / watermark** finally composites, the lower third gains shape/position,
and Creator Styles carry the treatment.

## 1. What was built

### Logo / watermark layer (the new capability)
The logo becomes **another full-frame transparent PNG overlaid at `0:0`**,
exactly like the gradient and lower third — so the segment-wise plan and both
render engines are untouched. The worker draws the logo into the chosen corner,
sized to `widthPct` of frame width (aspect preserved), at `opacity`, on a
transparent frame; the plan just adds one more `overlay=0:0` on top.
- Core: `BRAND_LOGO_IMAGE`, `brand.logo` in `brandExportConfigSchema`
  (`{storagePath, position, opacity, widthPct}`), the topmost layer in
  `buildExportPlan`, and shared `logoBox()` geometry.
- Worker: `renderLogoImage` (decode + place + opacity) — **returns null for
  undecodable images (e.g. SVG)**; `render-export` resolves the logo *before*
  planning (so the plan matches) and **skips it on any failure — never breaks a
  render**.

### Canonical z-order
Aligned to the approved order: **video → gradient → lower third → captions →
logo**. Captions are the highest *readability* layer; the logo sits on top for
branding. (The caption/lower-third z-swap is visually inert given the 6B.1
caption lift, but correct if they ever meet.)

### Lower Third Studio
`lower_third_default` gained additive-optional **`position`** (4 corners,
RTL-aware) and **`shape`** (`bar` | `box` | `none`); `renderLowerThirdImage`
honors them. Absent = the 6B.1 bottom-start bar, unchanged.

### Overlay Studio UI + export parity
- `OverlayStudio` in the Brand Kit form: logo enable, a 2×2 corner picker,
  opacity + size sliders, and a **live preview** whose CSS geometry mirrors the
  worker's `logoBox` (margin %, width %) — **no fake preview**.
- Lower Third Studio controls (shape + position).
- Save persists lower-third position/shape into `lower_third_default` and the
  logo placement default into **`user_metadata.logo_overlay`** (zero migration).
- The editor page composes `exports.brand.logo` from `brand_kits.logo_path` +
  the placement pref; the export snapshots it.

### Creator Styles integration
`CreatorStyle` gained optional lower-third `shape`/`position` and `logo`
placement; applying a style seeds them (the logo **image** stays the creator's).

## 2. Architecture decisions
1. **Logo = one more full-frame PNG at 0:0.** No new graph shape, no scale/
   opacity ffmpeg filters (the worker bakes size+opacity into the PNG), no
   engine change — the render architecture is untouched.
2. **Resolve the logo before planning; skip on any failure.** The plan's layer
   set always matches the staged images; an SVG/missing/corrupt logo drops the
   layer with a warning — a cosmetic overlay never fails a render.
3. **Shared `logoBox` geometry** in core makes the preview and the export place
   the logo identically (the parity mandate).
4. **Zero migrations.** `exports.brand.logo` + lower-third fields are additive
   jsonb; the logo placement default rides `user_metadata` (the 6C pattern);
   the logo image already lives in `brand_kits.logo_path`.

## 3. Database & migration decision
- **None.** `exports.brand` (free-form jsonb) gains `logo`; `lower_third_default`
  gains `position`/`shape`; `user_metadata.logo_overlay` holds the default.
  (Alternative noted: a `brand_kits.logo_default` column — deferred.)

## 4. Tests (150 → 160)
- **Core (+4)** — logo is the top overlay after captions; logo-only brand; the
  z-order is gradient→lowerThird→captions(→logo); `logoBox` corner geometry;
  schema clamps `widthPct`/`opacity`.
- **Worker (+6)** — `renderLogoImage` rasterizes a real PNG and returns null on
  SVG/corrupt; every corner renders; lower-third bar/box/none × 4 positions; an
  **unavailable logo is skipped gracefully** (render still uploads, no logo
  layer in the plan).

## 5. Verification
- 160 tests green; `tsc` clean across core/worker/web; `next build` ✓; ar/en
  parity 384 = 384 (Arabic first).

## 6. Backward compatibility
- Absent `logo` / lower-third fields → pre-6C.3 render. The z-swap is inert for
  existing configs (captions already lifted). Zero migrations; older exports
  unchanged (regression-tested); unbranded exports byte-identical.

## 7. Deferred
- Onboarding wizard (6C.4). SVG logo rasterization; per-project overlay
  overrides; animated overlays; a `brand_kits.logo_default` column.

## 8. Production
- **Both worker and web deploy** (render changed). A frame-verified E2E (logo
  composited over captions + gradient; lower-third box; unbranded unchanged) is
  recorded below.
