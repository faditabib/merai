# Build 7.4 Analysis — Scenes + Worker Stitch (multi-clip recording projects)

Date: 2026-07-16 · Analysis before code. The ONE Build 7 pipeline change
(anticipated in [BUILD_6C_ANALYSIS.md](BUILD_6C_ANALYSIS.md) §5 and the 7.1
decomposition).

## 1. The shape of the change

A recording session's kept takes become ORDERED SCENES of one project:
N scene uploads → a worker `stitch` job normalizes and concatenates them into
ONE source file → the existing single-source pipeline (transcribe → analyze →
edit → export) runs unchanged on the stitched source.

**Zero migrations, verified against the schema:**
- `jobs.type` has NO check constraint (free text) — a new `stitch` type is
  additive.
- `projects.status` stays `'uploading'` while scenes upload AND stitch (both
  are "getting the source ready"); the stitch handler moves it to
  `'transcribing'` exactly like `completeUpload` does today.
- `video_uploads` already supports N rows per project (FK, no uniqueness);
  the stitched file is simply one more row — created UP FRONT by the server
  action (status `'pending'`, path pre-assigned) so RLS/ownership stay
  app-side and the worker only fills bytes and flips status.
- Per-row duration CHECK (≤600s) + client/server total-duration validation;
  the STT measured duration remains the authoritative cap on the stitched
  source (unchanged three-layer rule).

## 2. Worker `stitch` handler

Payload (core zod): `{ projectId, ownerId, uploadIds[≥2 ordered],
stitchedUploadId }`; dedupe `stitch:{stitchedUploadId}`.

1. Load stitched row — if already `'uploaded'`, converge: enqueue transcribe,
   return (idempotent re-run).
2. Load scene rows — any missing/non-uploaded → `PermanentJobError`.
3. Download scenes (service client), then **normalize-then-join** — the
   export pipeline's proven pattern, NOT one giant filter graph (banned since
   Phase 4): per scene one small ffmpeg run → 1280×720 letterboxed, 30fps,
   H.264 + AAC 48kHz stereo; then concat-demuxer `-c copy` join. Peak memory
   bounded by one scene.
4. Upload the joined MP4 to the stitched row's pre-assigned path; set row
   `'uploaded'` + size.
5. Project → `'transcribing'`; enqueue `transcribe:{stitchedUploadId}`.

Injectable deps (`stitchWithDeps`) mirror `transcribeWithProvider` /
`renderExportWithEngine` — PGlite tests drive the full DB flow with fake
storage + fake ffmpeg.

Why re-encode per scene: recorded takes vary by mode (camera vs screen
composite) in codec/resolution/fps — `-c copy` concat of mismatched WebM is
invalid. One normalize pass per scene is the join contract, and scenes are
short (total ≤10 min).

## 3. Web

- `validate.ts`: `validateSceneSet` — per-scene `validateVideoFile` + total
  duration ≤ cap (`scenes-too-long`).
- `projects.ts` actions: `createProjectWithScenes` (project + N scene rows +
  1 pending stitched row, rollback on failure) and `finalizeScenes` (verify
  every scene object exists in storage → mark scenes uploaded → enqueue
  stitch). Same RLS/service-role split as the single-upload actions.
- `ScenesUploadFlow`: sequential tus uploads with per-scene progress
  (reuses `createResumableUpload` — the shared lib, not a copy of UploadFlow).
- RecordFlow: with ≥2 kept takes, "combine all takes into one project"
  becomes available (order = recording order; delete take = drop scene).
  The single-take path is untouched.

## 4. Files

| Area | File | Change |
|---|---|---|
| Core | `jobs.ts` | `stitch` job type + payload schema |
| Worker | `handlers/stitch.ts` (new) + `handlers/index.ts` | the handler |
| Web | `lib/upload/validate.ts` | `validateSceneSet` |
| Web | `app/actions/projects.ts` | the two scene actions |
| Web | `components/record/scenes-upload-flow.tsx` (new) | sequential tus + progress |
| Web | `components/record/record-flow.tsx` | combine-takes entry |
| Tests | core jobs schema · worker `stitch.test.ts` (PGlite) · web scene validation | |
| i18n | `record.scenes.*` (ar first) | |

## 5. Risks

1. **Codec variance across scenes** — solved by per-scene normalization (the
   whole point of the re-encode).
2. **A scene without an audio stream** would break `-c copy` concat — the
   recorder always includes the mic track (7.1/7.2), and the normalize pass
   maps `0:a?` with a silent-audio fallback via `anullsrc` shortest-pad only
   if needed → v1: recorder sources always carry audio; documented.
3. **Worker CPU contention** (stitch competes with renders on one loop) —
   same accepted trade-off as renders (DECISIONS 2026-07-10); scenes are
   short.
4. **Orphaned scene uploads** after stitch — they carry normal
   `expires_at`, the existing retention sweep reclaims them.

## 6. Verification
Core schema tests · worker PGlite tests (happy path, idempotent converge,
missing-scene permanent failure) · web validation tests · typecheck/build/
parity · live E2E: record 2 takes → combine → uploads → stitch job enqueued
(worker not running locally: job row + rows verified in DB; full stitch
verified after worker deploy on Railway).
