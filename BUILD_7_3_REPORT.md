# Build 7.3 Report — Teleprompter, Speaker Notes, Countdown Controls

Date: 2026-07-16 · Analysis: [BUILD_7_3_ANALYSIS.md](BUILD_7_3_ANALYSIS.md).
Third Build 7 sub-build — web-only (scenes + stitch are 7.4).

## 1. What was built

- **Prompter core** (`lib/record/teleprompter.ts`, pure): `scrollOffsetPx`
  (linear in the SESSION's pause-excluding elapsed — never wall clock),
  `estimateReadingSeconds` (whitespace word count, Arabic + Latin, 140 wpm),
  clamps for speed (10–120 px/s), font (18–48 px), countdown ({3,5,10}s).
- **Overlay** (`components/record/teleprompter.tsx`): `prompter` scrolls the
  script over the preview; `notes` renders it as a static band; DOM above the
  video — structurally unable to leak into the recorded MediaStream.
- **RecordFlow**: script-assist section (off / notes / prompter toggle,
  textarea with live "~mm:ss read" estimate, speed + font sliders) and a
  countdown picker (3/5/10s) beside Record. Prefs ride `merai.record.prefs`;
  the script drafts to its own localStorage key.

## 2. Bug found live (fixed): compositor-throttled scroll

The first implementation drove the scroll with a 250ms CSS transition
restarted per elapsed tick — under compositor throttling the computed
transform stalled while the target kept moving. Final design: the baseline
position renders inline from the 4Hz elapsed ticks (functional even where
rAF/compositor frames are suppressed — embedded panes, hidden tabs), and a
rAF loop overwrites with smoothed interpolation when frames fire.

## 3. Database & worker
None. Zero migrations.

## 4. Tests (190 → 195)

`test/teleprompter.test.ts` (5): mode set, offset linearity + negative-clock
guard + speed clamping, all clamps with garbage fallbacks, Arabic/Latin
reading estimates. Full suites green: **81 core + 73 worker + 41 web = 195**.
Typecheck ✓, `next build` ✓, i18n parity **475 = 475**.

## 5. Verification (live backend, synthetic camera)

| Check | Result |
|---|---|
| Script assist UI (toggle, textarea, estimate ≈00:06, sliders, countdown picker) | ✓ RTL |
| Scroll ≡ elapsed × speed | inline `−1290.24px` at 00:32 (32.256s × 40px/s — exact), `−1370.32px` at 00:34 ✓ |
| Pause freezes the script | frozen at −1370.32 across 2s while timer held 00:34 ✓ |
| Prefs + script draft persist across reload | ✓ (verified incidentally by a page reload mid-test) |
| Screen-denied non-blocking alert (7.2 path) | ✓ exercised live |
| Cleanup | throwaway user + rows deleted, 0 leftovers |

## 6. Backward compatibility
Prompter defaults to `off`; countdown defaults to 3s — 7.1/7.2 behavior
unchanged. No schema/worker change.

## 7. Production
Deployed with this build's Vercel push (web only).
