# Build 6C.3 Analysis — Overlay Studio

Date: 2026-07-12 · Analysis before code. Parent (approved):
[BUILD_6C_ANALYSIS.md](BUILD_6C_ANALYSIS.md). Third 6C sub-build — the one with
a real (but additive) render change: compositing the creator's **logo /
watermark**, plus a creator-facing **Overlay Studio** and **Lower Third Studio**
over the existing brand layer.

**Standing constraints:** do NOT redesign the render architecture · reuse the
existing segment-wise plan + PNG-overlay compositing · **no unnecessary
migrations** · reuse `brand_kits` / `exports.brand` JSON · keep worker changes
minimal · Arabic-first RTL · **preview = export (no fake preview)**.

---

## 1. Current pipeline audit

**Compositing (6B.1), per kept segment in `buildExportPlan`:**
- Each brand layer is a **full-frame transparent PNG overlaid at `overlay=0:0`**
  — the gradient and lower third are rendered full-frame with their content
  already positioned; the plan just stacks them.
- **Current z-order:** `video → gradient → captions → lower third` (lower third
  topmost). Captions are lifted clear of the lower-third band
  (`captionSpecAboveLowerThird`, 6B.1) so they never overlap spatially.
- Inputs are added dynamically (`nextInput++`), overlays chained via
  `overlayOnto`. Adding a layer = one more input + one more `overlay=0:0`.

**Worker (`render/brand.ts`):** `renderGradientImage` and
`renderLowerThirdImage` rasterize full-frame PNGs on Skia/HarfBuzz;
`render-export.ts` validates `exports.brand` (`brandExportConfigSchema`), calls
`renderBrandImages`, and stages the PNGs alongside captions. Both render engines
stage the `captionImages` array generically.

**Brand data today:**
- `brand_kits.logo_path` — logo **stored but never composited** (deferred in
  6B.1). `primary/secondary/accent`, `overlay_default` (gradient),
  `lower_third_default` (`{name?, title?, subtitle?, accentColor, textColor}`),
  `caption_default_config`.
- `exports.brand` jsonb snapshot = `{ gradient?, lowerThird? }`
  (`brandExportConfigSchema`) — **free-form and additive**.
- Editor page composes `exports.brand` from the kit; the worker renders it.

**Gap:** the logo is the missing layer; the lower third is fixed
(bottom-start bar, one shape); there's no creator-facing overlay editor.

---

## 2. Required changes

### 2.1 Logo / watermark layer (the core new capability)
- **Model (zero architecture change):** the logo becomes **another full-frame
  PNG overlaid at 0:0**, exactly like gradient/lower-third. The worker draws the
  logo onto a transparent full-frame canvas **at the chosen corner, at the target
  size, with the chosen opacity** — so the plan just adds one more `overlay=0:0`
  input. No scale/opacity ffmpeg filters, no new graph shape.
- **Core (`export-plan.ts`):** add `BRAND_LOGO_IMAGE`; when `brand.logo` is
  present, add it as the **topmost** overlay. Reorder to the approved canonical
  order **`video → gradient → lower third → captions → logo`** (see §2.4).
- **Worker (`render/brand.ts`):** `renderLogoImage(bytes, placement, w, h)` —
  decode the stored logo (`@napi-rs/canvas` reads PNG/JPEG/WebP; **SVG is not
  decodable by canvas** → see risks), draw it into a corner box sized
  `widthPct·frameW` (aspect preserved) with `globalAlpha = opacity`, margin from
  a shared constant. `render-export.ts` downloads the logo bytes via the service
  client (private `brand-assets`) and stages the PNG.
- **Snapshot (`exports.brand.logo`):** additive jsonb key
  `{ storagePath, position, opacity, widthPct }` — **no migration**
  (`exports.brand` is free-form; extend `brandExportConfigSchema`).

### 2.2 Lower Third Studio (modest expansion)
- Extend `lowerThirdConfigSchema` with **additive-optional** `position`
  (`bottom-start` default | `bottom-end` | `top-start` | `top-end`) and `shape`
  (`bar` default | `box` | `none`). Colors/name/title/subtitle already exist.
- `renderLowerThirdImage` honors `position` (which edge/corner, RTL-aware) and
  `shape` (accent bar vs. filled rounded box vs. text-only). **jsonb —
  no migration.**

### 2.3 Overlay Studio + Lower Third Studio UI (Brand Kit)
- **Overlay Studio** section in the Brand Kit form: logo upload (reuses the
  existing `brand-assets` upload), a **2×2 corner picker**, opacity + size
  sliders, and a **live preview** on a mock 9:16 frame showing the logo at the
  chosen corner/size/opacity — geometry driven by the SAME shared placement math
  the worker uses (§3).
- **Lower Third Studio:** the existing lower-third fields + a position picker + a
  shape toggle, previewed live.

### 2.4 Layer order (align to the approved canonical order)
Approved: **`video → gradient → lower third → captions → logo`** (captions are
the highest *readability* layer; logo sits above everything for branding). The
current code has captions under the lower third; **swap them** so captions
composite above the lower third, then add the logo on top. Because captions are
already lifted clear of the lower-third band, this z-swap is **visually inert
for existing configs** but makes captions win if a creator ever positions a
lower third into the caption band — matching the approved intent.

### 2.5 Creator Styles integration
- Extend `CreatorStyle` (6C.2) with **optional** `logo` placement defaults
  (`{position, opacity, widthPct}`) and `lowerThird` `{shape, position}`.
  Applying a style seeds these (into the logo-placement default + the
  lower-third config). The logo **image** stays the creator's own upload; a
  style only sets placement/treatment. Additive to the code catalog — no schema.

---

## 3. Export parity (no fake preview)

The preview and the export must place the logo/lower-third identically. Two
renderers exist (DOM preview vs. Skia canvas), so parity is by **shared
placement math in core**:
- `packages/core` exposes overlay geometry constants + a pure
  `logoBox(position, widthPct, frameW, frameH)` → `{x, y, w, h}` (margin as a
  fraction). The **worker** uses it (canvas pixels); the **preview** expresses
  the same via CSS percentages from the same constants. Same inputs → same
  placement.
- The lower-third `position`/`shape` geometry is likewise centralized.
- The preview reads the **same `exports.brand`-shaped config** it will snapshot;
  "what you see" is literally the snapshot rendered in the browser.

---

## 4. Migration decision (explicit)

**Zero migrations** — consistent with the approved 6C plan and the constraint.
| Data | Home | Migration |
|------|------|-----------|
| Logo export config (per render) | `exports.brand.logo` (additive jsonb key; extend `brandExportConfigSchema`) | **None** |
| Lower-third position/shape (per render) | `lower_third_default` / `exports.brand.lowerThird` additive-optional fields | **None** |
| Logo placement **default** (creator-level) | `user_metadata.logo_overlay` `{position,opacity,widthPct,enabled}` — same zero-migration store as `creator_style`/onboarding | **None** |
| Logo **image** | `brand_kits.logo_path` (already exists) | **None** |

**Why `user_metadata` for the logo default (not a new column):** `exports.brand`
is free-form so the snapshot needs no schema; but `brand_kits` has no jsonb slot
for logo *placement*, and the constraint is explicit about avoiding migrations +
reusing JSON. `user_metadata` is the established zero-migration home for
creator-level prefs in 6C (`creator_style`, `onboarding_*`), the dashboard/
Brand-Kit pages already load the user object, and it's fully reversible.
**Alternative (noted, not chosen):** a single additive `brand_kits.logo_default
jsonb` column co-locates brand data — revisit if logo placement ever needs to be
queryable or if `user_metadata` fragmentation becomes a smell.

**Net: 6C.3 ships with no migration** (additive jsonb keys + `user_metadata`).

---

## 5. UX plan

**Brand Kit page gains two studios (mobile-first, RTL):**
1. **Overlay Studio** — logo upload → 2×2 corner picker → opacity slider → size
   slider → live preview frame (logo at corner). An "enable on exports" toggle.
2. **Lower Third Studio** — name/title/subtitle (existing) + colors + shape
   toggle (bar/box/none) + position picker + live preview.

**Export flow:** the export panel already snapshots `exports.brand`; it now also
includes `logo` (from `brand_kits.logo_path` + `user_metadata.logo_overlay`) and
the expanded lower-third fields when branding is applied. The "your video style"
card can note "Logo: bottom-right".

**Creator Styles:** applying a style pre-sets logo placement + lower-third
treatment (not the image), so a style feels complete.

---

## 6. Files to touch

| Area | Files | Change |
|------|-------|--------|
| Core | `brand.ts` | `logo` in `brandExportConfigSchema` (`{storagePath,position,opacity,widthPct}`); lower-third `position`/`shape` optional; `BRAND_LOGO_IMAGE`; `logoBox()` + geometry constants |
| Core | `export-plan.ts` | add logo overlay (topmost); reorder to gradient→lower-third→captions→logo |
| Core | `creator-styles.ts` | optional `logo`/`lowerThird` treatment on `CreatorStyle` |
| Worker | `render/brand.ts` | `renderLogoImage`; honor lower-third position/shape |
| Worker | `handlers/render-export.ts` | download logo bytes → stage; validate extended `brand` |
| Web | `brand-kit-form.tsx` + new `overlay-studio.tsx`, `lower-third-studio.tsx` | the two studios + previews |
| Web | editor page / export panel | snapshot `logo` + expanded lower third |
| i18n | `messages/{ar,en}.json` | `overlayStudio.*`, lower-third additions (Arabic first) |

**Untouched:** EDL, AI Brain, transcription, the segment-wise plan shape, the
join, the render engines, migrations.

---

## 7. Risks & mitigations

1. **Preview ≠ export** (the cardinal risk) — *Mitigation:* shared `logoBox()`
   geometry in core used by both; the preview renders the snapshot config;
   frame-verify against the deployed worker before shipping.
2. **SVG logos** — `@napi-rs/canvas` can't rasterize SVG. *Mitigation:* accept
   PNG/JPEG/WebP for compositing; if a stored logo is SVG, skip the layer +
   surface a "re-upload as PNG" hint (never fail the render). Document.
3. **Logo aspect/size/transparency variance** — *Mitigation:* clamp `widthPct`
   (e.g. 0.08–0.35), preserve aspect, corner margin from the shared constant,
   `globalAlpha` opacity; validate the snapshot (loud `PermanentJobError` on
   malformed, like `brand`).
4. **Layer z-swap** — captions above lower third could in theory change a
   pixel. *Mitigation:* captions are already lifted clear; add a core test that
   the plan's overlay order is gradient→lowerThird→captions→logo; frame-verify.
5. **`user_metadata` fragmentation** (logo default apart from `brand_kits`) —
   *Mitigation:* documented; small, reversible; the column alternative is noted.
6. **Worker scope creep** — *Mitigation:* logo + lower-third position/shape are
   additive canvas draws; no new graph/engine/architecture.
7. **i18n volume** — *Mitigation:* Arabic-first, grouped `overlayStudio.*`,
   parity gate.

---

## 8. Implementation order

1. Core: `brand.ts` (logo + lower-third fields + `logoBox` + constants) →
   `export-plan.ts` (logo layer + reorder) → tests (order, logo layer present,
   `logoBox` geometry, schema).
2. Worker: `renderLogoImage` + lower-third position/shape; `render-export`
   logo download/stage + validation; worker tests (logo staged, malformed fails,
   unbranded unchanged).
3. Web: Overlay Studio + Lower Third Studio + previews (shared geometry);
   export snapshot wiring; Creator Styles treatment; i18n (ar first) + parity.
4. Verify: suites, typecheck, `next build`, parity; responsive/RTL.
5. Docs (`BUILD_6C_3_REPORT.md`, PROGRESS, DECISIONS) → deploy (web + **worker**,
   since render changed) → **frame-verified E2E**: a logo composited at a corner
   over captions + gradient, and an unbranded export unchanged.

---

## 9. Backward compatibility

- `exports.brand.logo` absent → no logo layer; existing exports byte-identical.
- Lower-third `position`/`shape` absent → current bottom-start bar (unchanged).
- The z-swap is visually inert for existing configs (captions already lifted).
- Zero migrations; the logo image already lives in `brand_kits.logo_path`.
- Worker deploys with the new render code; unbranded/older exports render as
  before (regression-tested).
