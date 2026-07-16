# Build 7.4 Report — Scenes + Worker Stitch (multi-clip recording projects)

Date: 2026-07-16 · Analysis: [BUILD_7_4_ANALYSIS.md](BUILD_7_4_ANALYSIS.md).
The one Build 7 pipeline change — and it landed with **zero migrations**.

## 1. What was built

- **`stitch` job** (core: new `JOB_TYPES` member + `stitchPayloadSchema` —
  ordered `uploadIds` + a pre-created `stitchedUploadId`).
- **Worker handler** (`handlers/stitch.ts`, deps-injectable like
  `transcribeWithProvider`): loads the pre-created stitched row (converges
  idempotently if already uploaded), validates every scene row is
  `'uploaded'` (else `PermanentJobError`), downloads scenes in payload order,
  **normalize-then-join** — per scene ONE small ffmpeg run to 1280×720
  letterboxed / 30fps / H.264 + AAC 48kHz stereo, then concat-demuxer
  `-c copy` join (the export pipeline's proven memory model; never one big
  filter graph) — uploads the MP4 to the pre-assigned path, flips the row,
  moves the project `uploading → transcribing`, and enqueues
  `transcribe:{stitchedUploadId}`. Downstream is byte-for-byte the
  single-source pipeline.
- **Web actions**: `createProjectWithScenes` (project + N ordered scene rows
  + 1 `'pending'` stitched row, rollback on failure) and `finalizeScenes`
  (verifies every scene object in storage → marks scenes uploaded → enqueues
  the stitch). `validateSceneSet` gates per-scene validity + the combined
  10-minute cap.
- **Recorder**: with ≥2 kept takes, "combine N takes into a project" sends
  the takes as ordered scenes through `ScenesUploadFlow` (sequential tus
  uploads with per-scene progress, reusing the shared tus lib). The
  single-take path is untouched. Over-cap totals disable the combine with an
  explanation.

## 2. Zero migrations — verified against the schema

`jobs.type` has no CHECK (free text); the project stays `'uploading'` during
scene upload + stitch (existing status); the stitched source is an ordinary
`video_uploads` row created up front by the action (RLS/ownership app-side;
the worker only fills bytes). Orphaned scene rows age out via the existing
retention sweep.

## 3. Tests (195 → 206)

- Worker `stitch.test.ts` (6, PGlite over real migrations): ordered
  downloads → stored join → row flips → transcribe enqueued; idempotent
  converge (no re-stitch, deduped transcribe); permanent failures for
  missing scene / unfinished scene / missing stitched row; no status
  regression for projects already past uploading.
- Web `validateSceneSet` (5): within-cap, exact-cap, too-few, over-cap,
  per-scene failure precedence.
- Full suites green: **81 core + 79 worker + 46 web = 206**. Typecheck ✓,
  `next build` ✓, i18n parity **483 = 483**.

## 4. Verification (live backend + real ffmpeg)

Throwaway user, synthetic camera; two real MediaRecorder takes (487KB +
427KB webm):

| Step | Result |
|---|---|
| Combine button (≥2 takes, total duration shown) | ✓ |
| `createProjectWithScenes` | project + 2 scene rows + 1 pending stitched row ✓ |
| Sequential tus uploads | both scene objects in storage ✓ |
| `finalizeScenes` | scenes `'uploaded'`, `stitch` job queued (dedupe `stitch:{id}`) ✓ |
| Worker stitch (REAL ffmpeg, local worker on the live queue) | see §5 |

## 5. Live stitch run (real ffmpeg, live queue, live providers)

The new-code worker ran locally against the LIVE production queue/backed
storage and processed the whole chain, every job on **attempt 1**:

```
claimed job … type=stitch attempt=1/3
stitch: 2 scenes → 0.9MB in 2s
claimed job … type=transcribe attempt=1/3
transcribe: upload 4de57889… completed (lang=en, provider=assemblyai)
claimed job … type=analyze attempt=1/3
analyze: project 72aa6ae6… ready (engine=haiku)
```

Final DB state: stitch/transcribe/analyze all `done` (attempts=1),
`stitched.mp4` = 954,577 bytes `'uploaded'` at the pre-assigned path, both
scene rows intact, **project `ready`** — the multi-scene path produced a
normal ready project end-to-end. Throwaway user + rows + storage cleaned, 0
leftovers.

## 6. Production

Web AND worker deployed (the worker changed for the first time in Build 7).
