# Build 6B.2 Report — Caption Studio (brand-aware caption presets)

Date: 2026-07-12 · 141 tests green (62 core + 67 worker + 12 web; was 133) ·
`next build` ✓ · ar/en parity 278 = 278 · migration 10 written. Analysis:
[BUILD_6B_2_ANALYSIS.md](BUILD_6B_2_ANALYSIS.md). Scope confirmed with the
owner: **brand-aware presets, no saved custom presets** (those → 6B.3).

Captions become a brand-aware preset system — entirely within the hard
constraints: **no EDL change, no AI Brain, no render-architecture change**
(still one caption PNG per line, same overlay compositing).

## 1. What was built

### Expanded preset library (core data)
Four new tokens alongside the original four:
- **`bold-impact`** — large (fontScale 1.25), 700, centered, black outline,
  uppercase Latin. Hype / short-form.
- **`outline-clean`** — white, 600, bottom, black outline, no box. Readable on
  busy footage.
- **`brand-box`** — box filled with the creator's **brand primary** color.
- **`brand-accent`** — text in the creator's **accent** color, outlined.

### Richer spec, honored everywhere
`CaptionStyleSpec` gained additive-optional `outline {color,width}`,
`fontScale`, and `useBrandColor: "text"|"box"`. Honored by **both** render
surfaces — the server rasterizer ([render/captions.ts](apps/worker/src/render/captions.ts))
and the editor's live preview + picker — so the editor never lies about the
export (analysis gap G4).

### Brand-aware captions (the key win — analysis gap G2)
`captionConfigForExport(token, brandColors)`
([captions.ts](packages/core/src/captions.ts)) resolves a brand preset to a
concrete spec using the creator's colors, or returns **null** when the plain
token path already carries everything. Resolution happens in the app (where
the colors live); the result is **snapshotted** to `exports.caption_config`,
keeping the renderer dumb — the same philosophy as `exports.brand` (6B.1).

### Export & preview wiring
- Export panel snapshots `caption_config` when branding is applied (null for
  plain presets → the unchanged token render).
- The editor and Brand Kit picker receive the kit's colors, so brand presets
  preview with the real look before export.

## 2. Architecture decisions
1. **`exports.caption_config` snapshot, not an EDL field.** The EDL keeps
   `captionStyle` as a token string; the resolved spec (with brand colors)
   rides a nullable export column. Null = pre-6B.2 render, byte-identical.
   Same snapshot rule as branding: resolve at export, later kit edits can't
   change a past render.
2. **Dropped the `caption_style_default` CHECK.** Adding tokens repeatedly
   would churn a DB constraint for a cosmetic column; the app validates with a
   zod enum that falls back to the default. The CHECK earned only migrations.
3. **Renderer stays dumb; the app resolves.** The rasterizer never reads
   `useBrandColor` — it draws concrete colors. Brand resolution is a pure core
   function used by the app and validated at the render boundary.
4. **Karaoke stays preview-only (gap G1, documented not fixed).** True
   per-word caption timing in export needs time-sliced PNGs = render
   architecture = out of scope. Karaoke exports as an honest static line.

## 3. Database (migration 10 — `20260712120000_caption_studio.sql`)
- `exports.caption_config jsonb` (nullable; null = token path).
- Drop `brand_kits_caption_style_default_check`.
- **Not yet applied live** at report time — applied with the deploy.

## 4. Tests (133 → 141)
- **Core (+6)** — every token has a schema-valid spec; `captionConfigForExport`
  returns null for plain/no-brand cases and resolves box/text brand colors;
  schema rejects a hostile `fontScale`; unknown token falls back safely.
- **Worker (+2)** — a brand-colored `caption_config` actually rasterizes
  caption PNGs through the real canvas path and uploads; a malformed
  `caption_config` is a `PermanentJobError` (no retry burn).

## 5. Verification
- 141 tests green; `tsc` clean across core/worker/web; `next build` ✓.
- ar/en parity 278 = 278 (Arabic authored first).
- Pre-existing lint (react-hooks in untouched files) unchanged — not a
  regression; house gate is build + tests.

## 6. Backward compatibility
- Every existing export has `caption_config = null` → the renderer uses
  `resolveStyleSpec(caption_style)` exactly as before (regression-tested in
  both core and worker).
- EDL untouched; new tokens are additive; unknown tokens fall back to default.

## 7. Deferred (documented)
- **Saved custom presets** (creator-named, fully customizable) + a dedicated
  Caption Studio tab — **6B.3** (owner chose the lean path here).
- **Animated / karaoke export** (gap G1) — needs render-architecture support.
- **Auto keyword highlighting** — needs the AI Brain.
- **Custom fonts** — licensing/vendoring.

## 8. Pending owner action
- Apply migration 10 + deploy (worker + web) + a frame-verified live E2E of a
  brand-colored caption — done in the production pass (see the production
  report once complete).
