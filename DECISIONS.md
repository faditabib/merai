# Merai — Architectural Decisions

## 2026-07-11 — EDL v2 (multi-track) foundation: readers-first, refusal over flattening
Build 5 introduces the multi-track EDL (explicit `timelineInMs` placement, video/audio/caption tracks, locked A/V pairs via `linkedClipId` — a J/L-cut is a linked pair whose windows differ — multiple assets, open effect/transition metadata) in `@merai/core/edl-v2.ts`, plus a serializable `EditCommand` surface (`edit-commands.ts`) that the editor UI and future AI re-editing share. Three binding rules: **(1) expand/contract, readers first** — every jsonb reader now goes through `parseEdl`/`edlV1ViewOf` (the blind `as EdlV1` casts are gone); writers keep producing v1 until the multi-track UI build, so production data is unchanged and no DB migration exists (the JSON `version` literal from Phase 0 is the discriminator). **(2) Downgrade refuses, never flattens** — `downgradeEdlV2ToV1` returns a typed reason (12 enumerated) for anything not v1-representable; the render handler turns that into a `PermanentJobError`. Silently dropping a track would corrupt a user's edit. Round-trip law `downgrade(upgrade(v1)) ≡ v1` is a test. **(3) AI edits are commands, not EDL patches** — models emit `EditCommand` JSON, zod-validated, routed through the same tested ops as the UI. **Revisit when:** the multi-track UI lands (editor state moves to v2, save writes v2, planner learns tracks).

## 2026-07-10 — Phase A hardening: permanent errors, over-cap download fallback, alerting, first deploys
Four decisions from the pre-first-users hardening pass:

**1. Deterministic job failures skip retries.** `PermanentJobError` (worker) short-circuits the queue: the runner hard-fails the job on attempt 1 (`failJobPermanently`), surfaces it to the exports/projects row, and fires an alert. Classified so far: missing exports/EDL/upload rows and storage size-cap rejections. **Why:** a deterministic failure re-rendered a 10-minute video 3× before failing (~3 min of wasted CPU per failure). **Revisit when:** a new failure class shows up mislabeled as permanent.

**2. Over-cap exports fall back to part-split storage, reassembled in the browser.** When the storage per-file cap rejects an output, the worker stores `{export}.mp4.partN` objects (45MB each, under the free-tier 50MB cap) and records `exports.parts` (migration 6); the panel downloads all parts and hands the user ONE assembled file via a Blob. **Why:** the render succeeded — the user should get their video, not an error, even before the Supabase Pro upgrade. Sub-cap exports are byte-identical to before (parts=1). **Revisit when:** Supabase Pro raises the cap — the fallback goes dormant but stays as a safety net.

**3. Ops alerting is a generic webhook.** `ALERT_WEBHOOK_URL` (worker) receives permanent-failure and db-pool-error alerts with a payload carrying both Slack (`text`) and Discord (`content`) fields; log-only when unset; never throws. No email infra, no vendor SDK.

**4. Vercel deploy findings (config-as-code where possible).** Project `merai-web`, root directory `apps/web` (set via `vercel api` — the CLI has no flag for it), framework pinned in `apps/web/vercel.json`; worker deploy config in `railway.json`. Two gotchas hit live: (a) `merai-web.vercel.app` is ANOTHER user's project — our real domain is `merai-web-faditabibs-projects.vercel.app` until merai.studio is attached; (b) SSG locale routes break @vercel/next's route→lambda mapping ("Unable to find lambda for route: /ar/login"), so the `[locale]` layout is `force-dynamic` for now — trivial pages, no meaningful cost. **Revisit when:** the builder handles Next 16 SSG locale routes, or the custom domain lands.

## 2026-07-10 — Export rendering moved fully server-side; ffmpeg.wasm removed
Strategic pivot (owner decision): unit economics showed ~$1.50/subscriber/month between browser and server rendering — not worth the wasm complexity (segment-wise workarounds, wasm FS management, device variance). ffmpeg.wasm is fully deleted; exports are now `render_export` jobs on the existing Railway worker, and the export panel is request + poll (same pattern as transcription) with server-checkpointed cancel. The segment-wise planner moved unchanged to @merai/core (it was already pure).

**Provider choice (owner asked: Rendi vs Very Good FFmpeg, pick by TS SDK support).** Verified from public pages 2026-07-10: Rendi has NO official SDK, ~$0.15/GB, and job-runtime caps of 1 min (free) / 10 min (Pro) — genuinely risky for 10-minute renders. Very Good FFmpeg has an official TS SDK (`@verygoodffmpeg/sdk`), raw-ffmpeg commands with `{{file}}` templating, 6-hour job runtime, $0.50/GB→$0.10→$0.08 tiers, 2GB free. **VGF wins on the stated criterion and on runtime limits.** Sources: rendi.dev/pricing, verygoodffmpeg.com, renderio.dev/blogs/ffmpeg-api-pricing-compared.
**Deviation, flagged:** the DEFAULT engine is `LocalFfmpegEngine` — native ffmpeg on the worker itself (one `apk add ffmpeg` in the Dockerfile). Zero marginal cost, media never leaves our storage↔worker path, and it was testable TODAY (a managed provider needs an account/key only the owner can create). The VGF engine is fully wired against their documented REST API (bearer + POST /api/ffmpeg + GET /api/jobs/{id}; the SDK README wasn't reachable, so no unverified SDK shapes) and activates via `VERYGOODFFMPEG_API_KEY` with zero code changes — the exact house pattern (AssemblyAI↔mock, Haiku↔heuristic). Like AssemblyAI in Phase 1, the VGF path is UNVERIFIED until the first live call. **Revisit when:** worker CPU contention appears (renders serialize with transcription on one loop) — then either a dedicated render worker or flipping the env key.

**Captions server-side:** @napi-rs/canvas (Skia+HarfBuzz) rasterizes caption PNGs with vendored IBM Plex Sans Arabic TTFs (OFL) — Arabic shaping visually verified before adoption (connected RTL letterforms). Same PNG-sequence overlay model; ffmpeg still never renders text.

**Measured (this desktop, 9.6-min stress clip, 13 segments, 137 captions):** render ≈ 55s wall (encode sum 35.9s + download/captions/join) vs 1,030s in browser wasm — ~15× faster and the whole "don't close the tab" class of UX is gone. Railway shared-vCPU timing TBD on first deploy.

Append-only log of non-trivial decisions. Each entry: context → decision → why → revisit-when.

## 2026-07-08 — Monorepo via npm workspaces
`apps/web` (Next.js/Vercel), `apps/worker` (Railway), `packages/core` (shared domain types: EDL, job contracts, caption tokens, filler lexicons, tier limits). Plain npm workspaces — no Turborepo/Nx; a solo-scale build doesn't need build orchestration. **Revisit when:** package count or build times grow.

## 2026-07-08 — Job queue: Postgres (Supabase) with FOR UPDATE SKIP LOCKED
No Redis/SQS/external queue. A `jobs` table + `claim_next_job()/complete_job()/fail_job()` SQL functions; the Railway worker polls every 2s over a direct Postgres connection. **Why:** zero extra infra/cost, transactional with domain data (enqueue + row update in one transaction), easily queryable status for the frontend (owners have read-only RLS on `jobs`). Retries: exponential backoff (30s·2^attempts), max 3 attempts, `dedupe_key` for idempotent enqueues. **Revisit when:** sustained > ~10 jobs/sec or need for fan-out/priority lanes.

## 2026-07-08 — Enum-like columns are text + CHECK constraints, not Postgres enums
Adding a value to a CHECK is a cheap constraint swap; altering enums is more ceremony (and was historically hazardous in migrations). **Revisit:** unlikely.

## 2026-07-08 — Timeline direction: LTR always, even in the RTL UI
Media scrubbers/timelines flow left→right universally (players, NLEs, YouTube in Arabic). Mirroring the timeline would fight every user's muscle memory. So: the *chrome* (panels, labels, transcript) is RTL-first, but the timeline/scrubber component is hard-pinned LTR (`dir="ltr"` on the component, time 0 at the left). Play/pause/seek icons are NOT mirrored; back/forward navigation arrows in the chrome ARE logical. This is binding for Phase 3.

## 2026-07-08 — i18n: next-intl, Arabic default at root path
`ar` is the default locale served at `/` (no prefix); English lives under `/en` (`localePrefix: "as-needed"`). Arabic is the design target; English adapts. All strings in `apps/web/messages/{ar,en}.json` — no hardcoded UI strings anywhere. RTL via `dir` on `<html>` + Tailwind logical utilities (`ms-*`, `text-start`, …), never `ml-*`/`text-left` for directional layout.

## 2026-07-08 — Browser locale detection disabled
next-intl's Accept-Language detection would send every English-configured browser to `/en` — but Arabic creators very commonly run English OS/browsers. Since this is an Arabic-first product, `/` always serves Arabic; English is an explicit user choice at `/en` (`localeDetection: false`). **Revisit when:** signup data shows meaningful English-primary usage.

## 2026-07-08 — Typography: IBM Plex Sans Arabic (single family, Arabic + Latin)
Loaded via `next/font`, covers both scripts so mixed-language lines don't change font mid-sentence. Also the default caption font in `@merai/core` caption specs.

## 2026-07-08 — Retention windows (margin decision)
Raw footage: **30 days** after upload (`video_uploads.expires_at`), then storage object deleted by the `cleanup_expired` worker sweep (Phase 6). Final exports: **90 days**. Rationale: raw files dominate storage cost at ~90% target margin; 30 days comfortably covers an edit cycle. The EDL + transcript survive expiry, so the *edit* is never lost — only re-rendering from raw becomes impossible. Windows are single constants in `@merai/core` (`RAW_RETENTION_DAYS`, `EXPORT_RETENTION_DAYS`) and migration defaults. **Revisit when:** users ask to re-edit older projects (offer paid retention as a Pro perk).

## 2026-07-08 — Worker runs TypeScript directly via tsx (no build step)
`@merai/core` ships as TS source; web compiles it with `transpilePackages`, the worker executes it with tsx at runtime. Avoids a package build/watch pipeline for a solo team. **Revisit when:** worker startup time or memory matters.

## 2026-07-08 — EDL is versioned, immutable, append-only JSON (v1 single-track)
`edl_versions` has insert+select RLS only — no updates; every edit appends a version (cheap undo/audit). v1 locks audio+video together; Phase 5 J/L-cuts will introduce a v2 schema with decoupled tracks. The `version` literal in the JSON discriminates. Zod-validated on both producer and consumer sides (`@merai/core`).

## 2026-07-08 — Transcripts: normalized words + raw provider payload both stored
`transcripts.words` is a provider-agnostic word array (stable ids, ms timestamps) that all downstream code uses; `transcripts.raw` keeps the full AssemblyAI response so Phase 2 analysis can be re-run or improved **without re-billing STT** (cost-relevant: STT is the largest per-unit cost).

## 2026-07-08 — Auth: Supabase email+password to start
Email confirmation flow wired through a locale-less `/auth/confirm` route (handles both `token_hash` and PKCE `code`). OAuth (Google/Apple) deferred until there's user pull. Profile rows are created by a DB trigger on `auth.users` insert, carrying the signup locale.

## 2026-07-08 — Next.js 16 conventions
Scaffolded on Next 16 (App Router, Turbopack default): `src/proxy.ts` instead of `middleware.ts` (nodejs runtime), async `params`/`cookies` everywhere. The proxy chains next-intl locale routing then Supabase session refresh on one response.

## 2026-07-08 — Transcription behind a provider interface; mock is the keyless default
`TranscriptionProvider` (worker) with two implementations: `AssemblyAIProvider` (fully wired: request building, polling, error handling) and `MockTranscriptionProvider` (AssemblyAI-shaped Arabic/English fixtures with realistic word timings, fillers, and re-take gaps). The mock routes fixture data through the SAME normalization code as the real provider, so mock-based tests exercise the production path. Selection is env-only: a present `ASSEMBLYAI_API_KEY` activates the real provider; `TRANSCRIPTION_PROVIDER=mock|assemblyai` overrides. The key is read in exactly one place (`apps/worker/src/transcription/index.ts`). AssemblyAI runs with `disfluencies: true` so hesitation sounds survive into the transcript — Phase 2's filler removal depends on them.

## 2026-07-08 — 10-minute cap enforced in three layers, no ffprobe infra
(1) Browser probes duration from video metadata before any byte uploads (UX), (2) server action + DB CHECK validate the client-reported duration, (3) the transcription provider's measured `audio_duration` is authoritative — over-long media permanently fails the upload/project and is never billed to usage. Running ffprobe server-side was deliberately skipped: it would require media tooling on Vercel/Railway for a check the STT provider gives us for free. **Trade-off:** a spoofed client duration is caught only after STT spend (≤10 min by the cap itself); acceptable at MVP scale.

## 2026-07-08 — Pipeline status lives on projects.status; frontend polls
The job queue is an implementation detail; the UI-facing state machine is `projects.status` (uploading → transcribing → analyzing → ready | error), updated by server actions and the worker. Phase 1 goes transcribing → ready directly; Phase 2 inserts the analyzing step. The project page polls every 2.5s until terminal — Supabase Realtime was deliberately skipped (publication setup + reconnect handling for zero MVP benefit). **Revisit when:** polling volume matters or live collaboration lands. Retries exhausted ⇒ worker marks the project error; the UI offers a retry action that requeues the job.

## 2026-07-08 — DB-level tests run on PGlite applying the real migrations
No Docker on the dev machine, so tests use PGlite (Postgres-in-WASM, in-process): every worker test run applies the actual `supabase/migrations/*.sql` (validating the SQL itself) against stubbed `auth`/`storage` platform schemas, then drives the real claim → handler → complete/fail path. Removed the redundant `create extension pgcrypto` from the init migration (gen_random_uuid() is core since PG13). Storage RLS policies and the tus endpoint can only be tested against a live Supabase project.

## 2026-07-08 — Resumable uploads: tus-js-client against Supabase's resumable endpoint, 6 MiB chunks
Supabase Storage's resumable protocol is tus 1.0.0 and requires 6 MiB chunks (`SUPABASE_TUS_CHUNK_SIZE`, override allowed only in tests). Pause keeps the server-side session; resume continues from the acknowledged offset; the client auto-retries dropped connections (verified in tests against a local tus server, including killed sockets); browser fingerprinting resumes interrupted uploads when the same file is re-selected. Object path: `{owner_id}/{upload_id}/original.<ext>` under the private `raw-uploads` bucket, uploaded with the user's JWT so storage RLS applies.

## 2026-07-08 — Arabic language handling: keep auto-detection, no pin
Live Arabic test (15s MSA/Levantine TTS with يعني/اه/طب fillers): AssemblyAI auto-detected Arabic at 0.9984 language confidence — `source_language: auto` stays the default, no hint needed. Observed quality (~11-13% WER on clean TTS, upper bound): fillers يعني/طب survived as separate correctly-spelled tokens; dialect vocabulary perfect; word confidences correlate strongly with errors (the two worst words were the two lowest scores) — Phase 2 should use confidence as a signal. Caveats logged for later: a hesitation (اه) can merge into the next word; brand names miss at high confidence (add AssemblyAI `word_boost`/custom vocabulary for product terms); Arabic output arrived without punctuation despite `punctuate: true` (matters for captions).

## 2026-07-08 — Brand terms: AssemblyAI custom_spelling adopted, word_boost rejected
Both probed live against the stored Arabic clip before adopting anything (lesson from the speech_models deprecation): `word_boost: ["ميراي"]` was accepted but changed nothing (ميري, identical confidence); `custom_spelling` fixed the token at word level (منصة ميراي). Provider now sends a small product-term correction map (ميري/ميراى → ميراي, Mireille/Miray/Mirai → Merai). Known trade-off: force-mapping can overcorrect genuine uses of those tokens (ميري as a person's name); acceptable while recordings are product-adjacent. **Revisit when:** user-defined custom vocabulary becomes a feature.

## 2026-07-09 — Export: single-threaded ffmpeg.wasm core, self-hosted
The multithreaded core needs SharedArrayBuffer → COOP/COEP response headers, and COEP would block the cross-origin Supabase signed-URL media the editor plays. Single-thread renders slower but keeps the page unisolated. Core (32MB wasm) is copied from @ffmpeg/core into public/ffmpeg at build — no CDN dependency. **Revisit when:** render times hurt on 10-min clips (options: COEP credentialless, or a render-server escape hatch — which would fight the margin model).

## 2026-07-09 — Exported captions are rasterized by the browser, never by ffmpeg
ffmpeg drawtext without fribidi/harfbuzz renders Arabic disconnected and reversed, and libass availability in the wasm build is uncertain. Each caption line is drawn onto a transparent full-frame PNG via Canvas2D (native Arabic shaping, same font as the UI) and overlaid with enable='between(t,…)' windows in output time. Verified live: extracted frame shows correctly shaped, connected RTL Arabic. Trade-off: karaoke word-level highlight burns as line-level in MVP (a PNG per word state is impractical); word-level remains preview-only — flagged as polish.

## 2026-07-09 — Export renders SEGMENT-WISE; single filter graphs are banned for cuts
The 10-minute stress test killed three single-command architectures in a row — each ran out of memory **even in native ffmpeg** (32GB machine, 20GB free): (1) one overlay filter per caption line (139 concurrent overlays ≈ 139 full-frame RGBA decoders), (2) N-branch trim+concat cuts (later segments' frames buffer in concat's input queues while earlier ones drain — worst case approaches the whole decoded video in RAM), (3) a single-pass select/aselect graph. A plain full-length encode succeeded, isolating the filter graphs as the cause. **Architecture now:** one small ffmpeg run per kept segment (`-ss`/`-t` INPUT seeking — only that window is ever demuxed/decoded), captions overlaid per segment as ONE concat-demuxer image sequence (PNGs + transparent gaps, windows clipped to segment-local time), then a final `-c copy` remux join. Peak memory is bounded by one segment regardless of total duration; frames are encoded exactly once (no generational quality loss); reordered timelines need no special path (segment file order = output order). Native validation on the 9.6-min clip: **36s total, join 0.3s**. Known trade-offs: AAC junctions can carry a ~20-40ms priming artifact at cut points (already discontinuities — inaudible in practice), ~N× ffmpeg startup + keyframe seek-decode overhead (negligible), and intermediate segment files live in the wasm FS until the join (source + PNGs deleted before joining to lower the ceiling). **Revisit when:** 1080p export or client CPUs make wasm encode times unacceptable — then the fork is multithreaded core (COOP/COEP story) vs. server-side rendering.

## 2026-07-09 — Export resolution: 720-class (9:16→720×1280, 1:1→720×720, 16:9→1280×720)
wasm encode speed and memory over pixels; x264 veryfast + crf 23 + aac 128k. A 16s clip rendered in well under 4 minutes single-threaded. **Revisit when:** creators ask for 1080p (needs the multithreaded-core question answered first).

## 2026-07-08 — Storage layout: owner-uuid-prefixed paths in private buckets
`raw-uploads/{owner_id}/{upload_id}/original.<ext>` and `exports/{owner_id}/{export_id}.mp4`. Storage RLS grants access only when the first path folder equals `auth.uid()` — no public buckets, all delivery via signed URLs.
