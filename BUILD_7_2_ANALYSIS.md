# Build 7.2 Analysis — Screen + Camera Recording, PiP, Preferences

Date: 2026-07-16 · Analysis before code. Parent: [BUILD_7_1_ANALYSIS.md](BUILD_7_1_ANALYSIS.md)
(decomposition) · builds directly on the 7.1 recorder.

## 1. Design

### 1.1 Modes
`camera` (7.1, unchanged) · `screen` · `screen-camera` (Tella-style camera
bubble over the screen).

### 1.2 The composite is burned in client-side (the binding decision)
For `screen-camera`, both streams draw onto ONE canvas
(`canvas.captureStream()`); the camera renders as a PiP bubble whose geometry
is **core's `logoBox`** — the exact corner/margin/width math the brand logo
uses (shared constant `OVERLAY_MARGIN_PCT`, same widthPct semantics). One
canvas stream → the 7.1 `RecorderSession` unchanged → ONE blob → the existing
single-source pipeline. No multi-track EDL, no render change, nothing new
downstream. The recording preview IS the canvas being recorded —
preview = output by construction (house mandate).

Audio: mic + (optional) display audio mixed via one `AudioContext`
destination; the mixed track joins the canvas stream.

### 1.3 Acquisition & lifecycle
- `getDisplayMedia` requires a user gesture → the screen picker opens on
  **Start recording** (before the countdown), not on page load.
- The browser's native "stop sharing" ends the screen track → treated as
  **stop** (take completes gracefully, never lost).
- Camera modes keep the 7.1 device pickers; `screen` mode records mic audio
  with the screen.

### 1.4 Preferences (localStorage, device-level like 7.1 device picks)
`merai.record.prefs`: mode + PiP corner (2×2 picker, same UI language as the
Overlay Studio) + PiP size (widthPct slider, clamped 0.12–0.35). Account-level
prefs stay out until a settings surface exists (no metadata sprawl).

## 2. Files

| File | Change |
|---|---|
| `lib/record/composite.ts` (new) | `pipBox` (= `logoBox` re-application), `streamsForMode`, `createCompositeStream` (canvas loop + audio mix + stop) |
| `components/record/record-flow.tsx` | mode selector, PiP prefs, screen acquisition, composite preview, share-ended → stop |
| `test/composite.test.ts` (new) | pip geometry ≡ logoBox, clamping, mode → required streams |
| `messages/{ar,en}.json` | mode labels, PiP controls, screen errors (ar first) |

## 3. Risks

1. **Canvas fps/perf** — 30fps interval loop (rAF throttles when backgrounded);
   canvas sized to the SCREEN track's native resolution capped at 1920 wide.
2. **Screen-share denial / abort** — translated error state, back to setup.
3. **System-audio availability varies** — mic is always mixed; display audio
   only when the browser provides a track (no failure path).
4. **Bubble aspect** — camera aspect from track settings (fallback 16:9),
   cover-fit inside a rounded bubble (no distortion).

## 4. DB/worker impact
None. Zero migrations.

## 5. Verification
Unit (geometry/modes) · suites/typecheck/build/parity · live E2E with
synthetic camera + synthetic "screen" stream (getDisplayMedia override):
screen-camera composite recorded → upload → project, PiP position verified
against `logoBox` output in-page.
