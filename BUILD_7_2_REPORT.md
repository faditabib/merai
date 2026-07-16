# Build 7.2 Report — Screen + Camera Recording, PiP, Preferences

Date: 2026-07-16 · Analysis: [BUILD_7_2_ANALYSIS.md](BUILD_7_2_ANALYSIS.md).
Second Build 7 sub-build, directly on the 7.1 recorder.

## 1. What was built

- **Three recording modes**: `camera` (7.1, unchanged) · `screen` ·
  `screen-camera` (camera bubble over the screen, Tella-style).
- **Composite core** (`lib/record/composite.ts`): for screen modes both
  streams draw onto ONE canvas (`captureStream`) — screen letterboxed
  full-frame, camera cover-fit in a rounded PiP bubble whose geometry **is
  core's `logoBox`** (same corners, margins, widthPct semantics as the brand
  logo layer). Mic + display audio mix through one `AudioContext`. The canvas
  stream feeds the 7.1 `RecorderSession` unchanged → ONE blob → the existing
  single-source pipeline. Frame size = screen native capped at 1920, forced
  even for encoders.
- **Lifecycle**: the screen picker opens on Start (user-gesture requirement);
  browser-native "stop sharing" completes the take gracefully; composite and
  screen tracks torn down on take completion; camera preview restored.
- **Preferences** (`merai.record.prefs`, device-level like 7.1 device picks):
  mode + PiP corner (2×2 picker, Overlay-Studio language) + PiP size slider
  (clamped 0.12–0.35).
- **Preview = output**: during screen-mode recording the preview video plays
  the composite stream itself; mirroring applies only to the raw selfie
  camera, never the composite.

## 2. Bug found live by the E2E (fixed)

The phase-change effect that re-attaches the preview overwrote the composite
stream with the raw camera when recording started — the recording was correct
but the preview lied (violating preview=output). Fix: the effect prefers the
active composite stream. Verified by pixel sampling after the fix.

## 3. Database & worker

**None.** Zero migrations; the composite is one ordinary upload.

## 4. Tests (178 → 190)

- `test/composite.test.ts` (12): mode→streams matrix, `pipBox ≡ logoBox`
  equivalence across all four corners, shared-margin assertion, width
  clamping (range + garbage), frame sizing (native/ultrawide/fallback/even).
- Full suites green: **81 core + 73 worker + 36 web = 190**. Typecheck ✓,
  `next build` ✓, i18n parity **466 = 466**.

## 5. Verification (live backend, synthetic camera + synthetic screen)

Throwaway user; magenta canvas = camera, blue canvas = screen, injected as
`getUserMedia`/`getDisplayMedia`; the REAL MediaRecorder recorded the real
composite:

| Check | Result |
|---|---|
| Mode selector + PiP prefs render | ✓ (RTL) |
| Live preview during recording | pixel-sampled: center `[29,78,216]` = screen blue; `(1100,600)` inside the computed `logoBox` bottom-end bubble = `[192,38,211]` camera magenta; top-start corner = blue (no bubble) ✓ |
| Stop → keep → use | `createProjectWithUpload({durationSeconds: 40.1, filename: "recording-take-1.webm", mimeType: "video/webm"})` → tus → `completeUpload` → project page ✓ |
| Cleanup | user + rows + storage deleted, 0 leftovers |

Native-hardware screen picking (real `getDisplayMedia` chooser) remains an
owner smoke check; every code path around it was exercised for real.

## 6. Backward compatibility

Camera mode is byte-identical to 7.1; prefs default to `camera`; no
schema/worker change.

## 7. Production

Deployed with this build's Vercel push (web only).
