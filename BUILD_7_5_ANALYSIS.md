# Build 7.5 Analysis — Auto Canvas

Date: 2026-07-16 · Analysis before code.

## 1. What Auto Canvas is here

A PURE layout brain in core (`auto-canvas.ts`) + an "Auto" mode in the export
panel. It decides — from the actual source video dimensions and the brand
config — the aspect ratio, safe margins, caption anchor, and logo corner.
All outputs flow through channels that already exist (`edl.aspectRatio`,
`exports.caption_config.verticalAnchor`, `exports.brand.logo.position`), so
there is **zero render/worker/DB change**: layout-aware rendering falls out
of the existing snapshot pipeline.

## 2. Rules (deterministic, tested)

1. **Aspect recommendation** from source dims: w/h ≥ 1.5 → `16:9` (screen
   recordings, landscape); ≤ 0.8 → `9:16` (selfie/portrait); else `1:1`.
   Unknown dims → `9:16` (the product's short-form-first default).
2. **Safe margins** = `OVERLAY_MARGIN_PCT` (0.05) — the SAME shared constant
   the logo layer and PiP bubble already use; the caption band clamps into
   [0.12, 0.88] of frame height (title-safe).
3. **Caption anchor**: keep the creator's spec anchor, then (a) clamp into
   the safe band, (b) if a BOTTOM lower third exists, lift to ≤ 0.72 (the
   convention the style catalog already uses — e.g. `viral`), (c) if a TOP
   lower third exists, push to ≥ 0.30.
4. **Logo corner**: first FREE corner in the watermark preference order
   `top-end → top-start → bottom-end → bottom-start`, where occupied means
   the lower-third corner and the caption band's two corners (anchor ≥ 0.6
   blocks the bottom corners; ≤ 0.4 blocks the top ones).

## 3. Integration

Export panel gains a **canvas mode**: `auto` (default when the editor can
read the source's `videoWidth/Height`) vs `manual` (today's three buttons —
untouched behavior). Auto mode: aspect set from the recommendation; the
snapshot assembly runs the caption anchor + logo corner through
`applyAutoLayout` before insert. A summary line explains what Auto chose
(transparency, no silent magic).

## 4. Files

| File | Change |
|---|---|
| `packages/core/src/auto-canvas.ts` (new) + `index.ts` | the rules |
| `packages/core/test/auto-canvas.test.ts` (new) | every rule + edge |
| `apps/web/.../editor-view.tsx` | pass source dims (videoWidth/Height) |
| `apps/web/.../export-panel.tsx` | Auto/manual toggle + layout application |
| `messages/{ar,en}.json` | `export.autoCanvas.*` (ar first) |

## 5. DB/worker impact
None. Zero migrations. The worker renders the adjusted snapshot exactly as
it renders any snapshot.

## 6. Verification
Core rule tests · suites/typecheck/build/parity · live: editor with a 16:9
source shows Auto → 16:9 + chosen corners in the summary; snapshot rows
carry the adjusted anchor/corner.
