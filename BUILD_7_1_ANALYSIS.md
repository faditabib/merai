# Build 7.1 Analysis — Recording Foundation (Creator Studio)

Date: 2026-07-16 · Analysis before code. Parent feasibility study:
[BUILD_6C_ANALYSIS.md](BUILD_6C_ANALYSIS.md) §5 (Tella-style recording —
"Build 7"). First Build 7 sub-build.

**Build 7 decomposition (small, testable, verifiable):**
- **7.1 (this):** camera+mic recording page — permissions, device pickers,
  countdown, pause/resume, elapsed timer + 10-min cap, **take management**
  (record several, review, pick one), handoff into the EXISTING upload
  pipeline. Zero worker/DB change.
- **7.2:** screen + camera+screen capture, PiP preview, recording preferences.
- **7.3:** multi-scene projects + worker stitch (the one pipeline change),
  teleprompter + speaker notes.
- **7.4–7.6:** Auto Canvas · Timeline v2 · project organization.

## 1. Current state (what 7.1 plugs into)

- **Upload pipeline** (`upload-flow.tsx`): probe → `validateVideoFile`
  (MIME/size/duration — `video/webm` already allowed) →
  `createProjectWithUpload` → tus → `completeUpload` → project page. A
  recorded take is just a `File` — the same flow carries it end-to-end
  (transcription → AI → edit → export all unchanged).
- **Caps**: `MAX_RAW_UPLOAD_SECONDS` (10 min) enforced browser + server + STT;
  the recorder must surface and auto-stop at the cap (never produce an
  invalid take).
- **Dashboard**: `QuickActions` has a disabled "Record — soon" chip (6C.1
  placeholder) — becomes a real route.

## 2. Design

### 2.1 Recorder core (`apps/web/src/lib/record/recorder.ts` — pure + thin wrapper)

- `pickRecorderMimeType(isSupported)` — preference order
  `video/webm;codecs=vp9,opus` → `vp8,opus` → `video/webm` → `video/mp4`
  (Safari). Injectable predicate = unit-testable.
- `extensionForMime(mime)` → `webm`/`mp4`; `takeFilename(n, mime)` —
  deterministic take names (`recording-take-2.webm`).
- `RecorderSession` — thin `MediaRecorder` wrapper: start/pause/resume/stop →
  `Blob`; `ondataavailable` chunks; elapsed accounting that EXCLUDES paused
  time (interval sampling of segment starts); `maxDurationMs` auto-stop.
  The MediaRecorder itself is browser-only; everything computable is pure and
  tested (mime pick, filenames, elapsed math via injected clock).

### 2.2 Record page (`/dashboard/record`, `RecordFlow` client component)

States: `setup` → `countdown` (3·2·1 overlay) → `recording` (pause/resume ·
elapsed/cap timer · stop) → `review` (playback of the fresh take → keep or
discard) → `takes` rail (pick the best) → **handoff**.

- **Setup**: `getUserMedia({video, audio})`, live muted preview (mirrored),
  camera/mic `<select>`s from `enumerateDevices` (persisted to localStorage —
  device ids are per-device, not account state), permission-denied and
  no-device error states.
- **Pause/resume**: `MediaRecorder.pause()/resume()` — one continuous take
  blob, no stitching needed.
- **Cap**: timer turns amber near the cap; auto-stop at `MAX_RAW_UPLOAD_SECONDS`.
- **Takes**: kept takes listed with duration + size; re-record freely; **one**
  selected take proceeds (multi-scene stitch is 7.3).
- **Handoff**: the chosen take becomes a `File` handed to `UploadFlow` via a
  new optional `externalFile` prop — the existing component auto-starts and
  renders its own transfer UI. No duplicated upload logic; the dropzone is
  hidden when an external file is supplied (additive, default behavior
  unchanged).

### 2.3 Entry point

`QuickActions`: "Record" becomes a real link to `/dashboard/record` (soon-chip
removed).

## 3. Database / worker impact

**None.** One take = one upload = the existing single-source project. RLS,
jobs, transcription, render — all untouched.

## 4. Files to touch

| Area | File | Change |
|---|---|---|
| Web | `lib/record/recorder.ts` (new) | pure helpers + RecorderSession |
| Web | `components/record/record-flow.tsx` (new) | the state machine UI |
| Web | `app/[locale]/dashboard/record/page.tsx` (new) | route (auth + shell) |
| Web | `components/upload-flow.tsx` | additive `externalFile` prop |
| Web | `components/dashboard/quick-actions.tsx` | real Record link |
| Web test | `test/recorder.test.ts` (new) | mime pick, filenames, elapsed math, cap |
| i18n | `messages/{ar,en}.json` | `record.*` (Arabic first) |

## 5. Risks & mitigations

1. **Codec/container variance** (Safari records MP4) — *Mitigation:* mime
   preference with fallback; both webm+mp4 are in `ALLOWED_VIDEO_MIME_TYPES`
   and ffmpeg/AssemblyAI consume both. (Parent analysis flagged this.)
2. **Permission denial / no devices** — dedicated, translated error states
   with retry; never a blank screen.
3. **Memory (takes are in-RAM blobs)** — 10-min cap bounds a take (~100–150MB
   VP9); takes rail shows size; discarded takes are released (`URL.revokeObjectURL`).
4. **Elapsed drift across pause** — segment-based accounting, unit-tested.
5. **In-app browser E2E can't grant a real camera** — verify all pre-camera
   states + the route + suites in-browser; full record→upload path is
   manual/owner verification (documented in the report), the upload path
   itself is already production-verified.

## 6. Verification plan

- Unit: recorder pure helpers (mime, filename, elapsed, cap).
- Typecheck + full suites + `next build` + i18n parity.
- Browser: /dashboard/record renders setup + error states; QuickActions link;
  RTL + mobile pass.

## 7. Backward compatibility

`UploadFlow` without `externalFile` is byte-identical in behavior; the new
route is additive; no schema/worker change.
