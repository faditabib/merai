# Merai — Progress Log

## Phase 2 — AI analysis layer (BUILT, live-verified 2026-07-08)

### Done (44 tests passing: 32 worker + 12 web)
- **Analysis engines** behind `AnalysisEngine` (same pattern as transcription):
  `HaikuAnalysisEngine` — claude-haiku-4-5, ONE call per video, temperature 0,
  forced tool-use JSON (schema-validated), result persisted on the transcript
  so retries/regeneration never re-bill; `HeuristicAnalysisEngine` — keyless
  fallback removing only unambiguous hesitations. Factory is env-driven:
  **setting ANTHROPIC_API_KEY activates Haiku, zero code changes.**
- **EDL builder** (pure, defensive): silence detection from word gaps
  (interior > 800ms, lead/trail), 120ms padding with midpoint overlap
  resolution, filler/false-start/retake removals with reason precedence,
  invalid AI word-ranges skipped with warnings; output schema-validated.
- **Pipeline**: transcribe → enqueue analyze (deduped) → status `analyzing` →
  EDL v1 (source='ai') → `ready`. Migration 3 adds transcripts.analysis.
- **UI**: edit-summary chips (kept duration + removals by reason) and
  struck-through removed words in the transcript, ar+en.
- **Live run** (heuristic engine, real AssemblyAI): 16s Arabic clip with an
  isolated اه and a spliced 2s silence → 23 words, `analyzing` stage visible,
  EDL: 3 kept segments, حشو: 1 (آه struck through in UI), صمت: 2, kept
  duration 13s of 16s. custom_spelling confirmed live: ميراي now correct.

### To activate Haiku analysis (tomorrow-you)
Add `ANTHROPIC_API_KEY` to apps/worker/.env — nothing else. The Haiku path is
fully built and stub-tested (prompt shape, forced tool call, schema/error
paths); it has not yet made a live API call. `ANALYSIS_ENGINE=heuristic|haiku`
forces either engine.

### Deferred
- `generate_edl` job stays a stub — reserved for user-triggered regeneration
  (Phase 3), which will reuse the persisted analysis without re-billing.
- Haiku prompt tuning against real creator footage (retake grouping quality)
  — needs the live key + messy real recordings.

### Original plan (kept for reference)

Goal: after transcription, auto-generate a first-draft EDL with silence,
fillers, false starts and weak takes removed (project status gains the
`analyzing` step: transcribing → analyzing → ready).

Committed design points, including both gaps found in the live Arabic test:

1. **Filler detection is NOT token matching.** Candidates come from three
   sources: (a) lexicon matches (@merai/core fillers, Arabic-normalized),
   (b) **low-confidence words (< 0.6) — required because live testing showed a
   hesitation (اه) can merge into the next word (أهرفع @ conf 0.361)**,
   (c) unambiguous hesitation sounds. Candidates + context go to Claude Haiku
   for classification; only unambiguous fillers may be removed without AI.
2. **Caption segmentation is timing-gap based, not punctuation based** —
   live Arabic output arrived with NO punctuation despite punctuate:true.
   Caption lines break on inter-word gaps (with char-length caps); punctuation
   is a secondary signal used only when present. (Constants land in
   @merai/core now; the renderer consumes them in Phase 3/4.)
3. Silence detection needs no AI: interior word-timing gaps > threshold,
   with padding preserved around speech edges.
4. Best-take/false-start detection: Haiku compares repeated/aborted phrase
   groups; "strongest take" = complete + fewest fillers + confidence.
5. **Cost rules**: Haiku ONLY (claude-haiku-4-5), one analysis call per video,
   forced tool-use JSON output (no free-form parsing retries), analysis stored
   on the transcript row so EDL regeneration never re-bills the model.
6. Keyless dev fallback mirrors Phase 1: a heuristic engine (unambiguous
   fillers + silence only) runs when ANTHROPIC_API_KEY is absent; tests are
   hermetic and never call the live API.
7. Brand-name accuracy: verify AssemblyAI word_boost live for Arabic before
   adopting it in the provider (evidence first — see speech_models incident).

---

## Phase 1 — LIVE end-to-end verification (2026-07-08) ✅

Full pipeline verified against the live Supabase project + real AssemblyAI,
driven through the actual browser UI (login → upload → processing → transcript):

- Speech clip (TTS-generated English, 197 KB): tus resumable upload to live
  Storage succeeded first try (Bearer JWT + new-format publishable key — no
  vendor quirks hit); job enqueued, claimed within 2s, **AssemblyAI transcribed
  31 words in ~10s**; transcript + word timestamps landed in `transcripts`;
  project reached `ready`; UI showed the transcript with word count, no mock
  badge.
- Tone-only clip: pipeline completed with 0 words (correct), provider-measured
  duration (6s) stored, **0.1000 raw minutes metered** — exposed a missing
  empty-transcript UI state, now fixed (ar+en).
- Retry machinery proven live: first attempt failed on a real API change (see
  below), backoff requeued it, attempt 2 succeeded — project never left a
  broken state.

**Live findings & fixes:**
1. AssemblyAI deprecated `speech_model`; now `speech_models:
   ["universal-3-5-pro", "universal-2"]` (fix from the API's own error
   message; provider, fixtures and tests updated).
2. Worker tests could leak real credentials from `apps/worker/.env` via dotenv
   and silently hit the live API — vitest now pins a hermetic env
   (`TRANSCRIPTION_PROVIDER=mock`, blank keys).

Test user for manual poking: `e2e-live@merai.test` (throwaway; password in the
session scratchpad, recreate anytime with the admin API).

---

## Phase 1 — Upload & transcription pipeline (overnight 2026-07-08, mock-verified)

### Fully built and tested (31 tests passing: 19 worker + 12 web)
- **AssemblyAI provider itself is test-covered against a stubbed HTTP layer**
  (submit payload shape, raw-key auth header, language pin vs. detection,
  polling through processing, provider-error/HTTP-error/timeout paths) — the
  live-key path has been executed end-to-end minus the network.
- **Resumable upload flow**: tus-js-client wrapper (6 MiB Supabase chunks, pause/
  resume/cancel, auto-retry on dropped connections, browser fingerprint resume),
  client-side duration probe + shared validation (10-min / 2 GiB / container
  types), drag-drop upload UI with progress, pause/resume/cancel and localized
  error states (ar+en), leave-page warning while transferring.
  *Tested:* real tus-js-client against an in-memory tus server — chunked
  transfer byte-identical, pause→resume from acknowledged offset, automatic
  recovery from two killed sockets, cancel deletes the server session.
- **Server actions**: create project+upload (validation, owner-scoped RLS
  inserts, rollback on partial failure), complete upload (storage object
  existence check, idempotent, enqueues transcribe job via dedupe_key),
  retry-processing for failed pipelines.
- **Transcription provider abstraction**: `AssemblyAIProvider` fully wired
  (submit, poll, error handling, `disfluencies: true`, language hint/detect);
  `MockTranscriptionProvider` with AssemblyAI-shaped Arabic + English fixtures
  (realistic ms word timings, يعني/اه/um/uh fillers, false starts, 2s re-take
  gaps) flowing through the same normalization as the real provider.
- **Transcribe job handler**: idempotent (unique transcript per upload, ledger
  dedupe), authoritative provider-side duration rejection, raw-minutes usage
  metering per UTC month, project status transitions incl. permanent-failure
  → error.
  *Tested end-to-end on real Postgres (PGlite) applying the actual migrations:*
  enqueue → claim → mock transcription → normalized words in `transcripts` →
  ledger row → project `ready`; re-run idempotency; over-long rejection (no
  billing); retry-exhaustion → project `error`. Queue semantics (oldest-first,
  type filter, backoff, dedupe) covered separately.
- **Status UI**: dashboard project list with live status chips; project page
  status stepper polling every 2.5s until ready/error; transcript view
  (RTL/LTR by detected language, word count, amber "mock provider" badge so
  fixture data is unmistakable); error panel with retry.

### Tomorrow: mock → live (exact steps)
1. **Provision Supabase** (this never existed — no `.env.local`/`.env` files
   were present on this machine, and no Docker for a local stack, so nothing
   could run against real Supabase tonight): create the project, apply
   `supabase/migrations/*.sql` in order, then fill `apps/web/.env.local` and
   `apps/worker/.env` from the `.env.example` files.
2. **Go live on STT**: add `ASSEMBLYAI_API_KEY` to `apps/worker/.env`. That's
   the entire switch — the provider factory picks AssemblyAI automatically
   when the key is present (no flag, no code change).
   `TRANSCRIPTION_PROVIDER=mock` remains available to force fixtures.
3. Test media: `tools/fixtures/test-clip-5s.mp4` (committed);
   `tools/make-fixtures.ps1 -IncludeOverlong` generates an 11-min clip to
   verify the rejection path live.

### Needs the live account (deliberately not simulated)
- AssemblyAI pricing, rate limits, concurrency and Arabic accuracy — no
  numbers were assumed anywhere.
- Supabase's exact tus endpoint behavior (metadata quirks, upsert semantics)
  — the wire protocol is tested, the vendor specifics are not. If the first
  live upload 4xx's, check bucket-name metadata and the x-upsert header.
- Storage RLS policies execute only on live Supabase (written, unexercised).

### Judgment calls / deferred
- AssemblyAI polling (not webhooks): simpler, fine at MVP scale; revisit if
  worker dyno-time cost shows up.
- After a `duration_exceeded` rejection, retrying re-submits the same media
  to STT (bounded by the 10-min cap); acceptable waste, noted.
- Dropzone keyboard accessibility + Supabase auth error i18n → polish pass.
- Upload UI not driven in a real browser session tonight (needs live
  Supabase auth + storage); everything below the UI is test-covered.

---

## Phase 0 — Project scaffolding & architecture (2026-07-08)

### Done
- npm-workspaces monorepo: `apps/web` (Next.js 16, App Router, TS, Tailwind v4),
  `apps/worker` (Railway job consumer), `packages/core` (shared domain types).
- Full Supabase schema as SQL migration (`supabase/migrations/20260708000000_init.sql`):
  profiles, projects, video_uploads, transcripts, edl_versions, exports,
  usage_ledger, jobs — with RLS on every table, private storage buckets
  (`raw-uploads`, `exports`) with owner-scoped object policies, profile-creation
  trigger, and the Postgres job queue (`claim_next_job`/`complete_job`/`fail_job`
  with SKIP LOCKED + exponential backoff).
- i18n scaffolding with next-intl: Arabic default at `/` (RTL), English at `/en`;
  all UI strings externalized in `messages/{ar,en}.json`; IBM Plex Sans Arabic
  via next/font; Tailwind logical utilities for direction-aware layout.
- Auth: Supabase email+password (signup with locale metadata, login, sign-out,
  email-confirm callback at `/auth/confirm` supporting token_hash + PKCE code);
  session refresh chained into the Next 16 `proxy.ts` after locale routing.
- Pages: Arabic-first RTL landing page, login/signup, auth-guarded empty dashboard.
- Worker skeleton: typed job contracts (zod) shared via `@merai/core`, polling
  loop with graceful shutdown, per-type handlers (stubs for transcribe/analyze/
  generate_edl/cleanup_expired), Dockerfile for Railway.
- Env var structure for AssemblyAI / Anthropic (Haiku) / Dolby.io / Pixabay
  (`.env.example` in both apps); `DECISIONS.md` started with 12 entries.

### Deferred / known issues
- Supabase auth error messages render in English (provider strings); mapping to
  translated messages planned alongside Phase 3 polish.
- `cleanup_expired` handler is a no-op until Phase 6 (retention).
- Tier quota numbers in `@merai/core/limits.ts` are placeholders pending
  Phase 6 pricing.
- No tests yet; test harness lands with Phase 1 (first real business logic:
  upload validation + transcript normalization).
- Supabase project itself not provisioned here — migration must be applied and
  env vars set before auth works end-to-end.

### Next (Phase 1 — awaiting schema/architecture confirmation)
Resumable upload flow (Supabase resumable/tus), duration validation (client +
server), transcribe job (AssemblyAI), job-status surface for the frontend.
