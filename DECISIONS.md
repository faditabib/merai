# Merai — Architectural Decisions

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

## 2026-07-08 — Storage layout: owner-uuid-prefixed paths in private buckets
`raw-uploads/{owner_id}/{upload_id}/original.<ext>` and `exports/{owner_id}/{export_id}.mp4`. Storage RLS grants access only when the first path folder equals `auth.uid()` — no public buckets, all delivery via signed URLs.
