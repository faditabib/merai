# Build 7.1 Report — Recording Foundation (Creator Studio)

Date: 2026-07-16 · Analysis: [BUILD_7_1_ANALYSIS.md](BUILD_7_1_ANALYSIS.md).
First Build 7 sub-build: Merai records, not just uploads.

## 1. What was built

- **Recorder core** (`lib/record/recorder.ts`): injectable-predicate mime
  selection (vp9→vp8→webm→mp4), container/extension/take-name helpers, a pure
  pause-excluding elapsed tracker, and a thin `MediaRecorder` session wrapper
  (1s chunks, pause/resume = one continuous blob, 10-minute cap auto-stop
  tied to `MAX_RAW_UPLOAD_SECONDS`).
- **Recording studio** (`/dashboard/record`, `RecordFlow`): live mirrored
  preview → camera/mic pickers (persisted per-device in localStorage) → 3·2·1
  countdown → recording with pause/resume + LTR mm:ss / cap timer (amber in
  the last minute) → per-take review (keep / discard) → **takes rail**
  (duration + size, delete, pick one) → handoff.
- **Handoff** into the EXISTING pipeline: the chosen take becomes a `File`
  passed to `UploadFlow` via a new additive `externalFile` prop (auto-start,
  no dropzone) — probe → validate → `createProjectWithUpload` → tus →
  `completeUpload` → project page → transcription. Zero new upload code.
- **Dashboard**: the 6C.1 "Record — soon" chip is now a real quick action.

## 2. Two production bugs found live by the E2E (fixed + regression-tested)

1. **Codec-qualified mime rejected**: a take typed
   `video/webm;codecs=vp9,opus` fails `validateVideoFile` (allowlist holds
   containers). Fix: the take `File` carries `containerOfMime(...)` →
   `video/webm`. Regression test asserts both directions.
2. **Chrome MediaRecorder WebM has no duration header**: `video.duration` is
   `Infinity` → probe returned null → "unreadable duration". Fix in
   `probeVideoDurationSeconds`: on non-finite metadata duration, seek past the
   end and read the corrected duration on `seeked`. This also fixes
   user-uploaded Chrome-recorded WebM files — a latent 10-minute-gate hole.

## 3. Database & worker

**None.** One take = one upload = the existing single-source project.
Multi-scene stitching is deliberately Build 7.3 (worker concat job).

## 4. Tests (166 → 178)

- `test/recorder.test.ts` (12): mime preference/fallback/none, container↔
  validator coherence, take filenames, pause-excluding elapsed (idempotent
  start, open-segment, no-op pause), mm:ss, and the live-found mime
  regression.
- Full suites green: **81 core + 73 worker + 24 web = 178**. Typecheck ✓,
  `next build` ✓ (`ƒ /[locale]/dashboard/record`), i18n parity **454 = 454**.

## 5. Verification (live backend, synthetic capture devices)

Throwaway user + a canvas/oscillator `MediaStream` injected as the camera/mic
(the sandbox has no hardware), driving the REAL `MediaRecorder`:

| Step | Result |
|---|---|
| No-device state | translated alert + retry ✓ (real sandbox behavior) |
| Setup | device pickers show injected devices ✓ |
| Countdown → record | timer 00:19/10:00 LTR chip ✓ |
| Pause → resume | paused timer froze (00:31), resumed ✓ |
| Stop → review | take 00:38 · 2.2MB, playback ✓ |
| Keep → takes rail → use | `createProjectWithUpload({durationSeconds: 21.8, filename: "recording-take-1.webm", mimeType: "video/webm"})` → tus → `completeUpload` → **project page** ✓ |
| Cleanup | user + project rows + storage objects deleted, 0 leftovers |

Real-hardware capture (physical camera/mic) can't run in this environment —
owner smoke on a laptop is the remaining manual check; every code path after
`getUserMedia` was exercised for real.

## 6. Backward compatibility

- `UploadFlow` without `externalFile`: behavior unchanged.
- New route + quick action are additive; no schema/worker change.

## 7. Deferred (by decomposition)

- Screen / camera+screen + PiP + preferences → **7.2**
- Multi-scene projects + worker stitch + teleprompter → **7.3**

## 8. Production

Deployed with this build's Vercel push (web only — worker unchanged).
