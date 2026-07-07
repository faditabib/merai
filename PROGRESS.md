# Merai — Progress Log

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
