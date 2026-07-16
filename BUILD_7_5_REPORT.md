# Build 7.5 Report — Auto Canvas

Date: 2026-07-16 · Analysis: [BUILD_7_5_ANALYSIS.md](BUILD_7_5_ANALYSIS.md).

## 1. What was built

- **Layout brain in core** (`auto-canvas.ts`, pure):
  `recommendAspectRatio` (landscape ≥3:2 → 16:9, portrait ≤4:5 → 9:16, else
  1:1; unknown → 9:16 short-form default), `autoCaptionAnchor` (title-safe
  clamp [0.12, 0.88] + lift ≤0.72 above a bottom lower third / push ≥0.30
  below a top one — the collision conventions the style catalog already
  uses), `autoLogoPosition` (first FREE corner in watermark preference
  order, avoiding the lower third's corner and the caption band's corners),
  composed by `applyAutoLayout`. Safe margin = `OVERLAY_MARGIN_PCT` — the
  same shared constant as the logo layer and the 7.2 PiP bubble.
- **Editor**: the player reports its real `videoWidth/Height` on metadata.
- **Export panel**: an **Auto** chip (default on) — the EDL aspect follows
  the recommendation while on; any manual ratio pick switches to manual.
  On export, the snapshot assembly routes the resolved caption anchor + logo
  corner through `applyAutoLayout`. A summary line states what Auto chose
  (no silent magic). **Zero render/worker/DB change** — outputs ride the
  existing snapshot channels (`edl.aspectRatio`, `caption_config`,
  `exports.brand.logo.position`), so layout-aware rendering falls out of the
  pipeline as-is.

## 2. Tests (206 → 221)

`auto-canvas.test.ts` (15): every aspect band + boundaries + garbage dims,
anchor keep/clamp/lift/push, corner preference/avoidance/fallback,
composition (+ logo-null passthrough). Full suites green: **96 core + 79
worker + 46 web = 221**. Typecheck ✓, `next build` ✓, parity **486 = 486**.

## 3. Verification (live backend, real pipeline)

Throwaway user; recorded a REAL 1280×720 (landscape) take → pipeline to
ready → editor:

| Check | Result |
|---|---|
| Auto chip on, summary states the choice | "الوضع التلقائي: صيغة **16:9** من أبعاد المصدر…" ✓ (default would have been 9:16) |
| Export snapshot row | `aspect_ratio: "16:9"` ✓ · `caption_config.verticalAnchor: 0.85` (inside the safe band, no lower third → correctly untouched) ✓ |
| Logo repositioning | no kit on the throwaway user → covered by the unit matrix |
| Cleanup | user + rows + storage deleted, 0 leftovers |

**Pre-existing edge found (out of scope, flagged as a follow-up task):** a
0-word transcript yields a 0-segment EDL whose render fails at the concat
join after 3 retries — exports of empty edits should be refused up front.

## 4. Backward compatibility

Manual aspect selection behaves exactly as before (Auto off = 6C behavior);
Auto only ever writes values the schemas already validate.

## 5. Production

Deployed with this build's Vercel push (web only — worker unchanged).
