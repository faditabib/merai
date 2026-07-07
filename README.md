# Merai (مِيراي)

AI video editing OS for Arabic-speaking content creators — upload raw footage, the AI edits (transcription, best-take selection, silence/filler removal, captions), you review and export.

## Repository layout

```
apps/web        Next.js 16 app (Vercel) — Arabic-first UI, RTL, next-intl
apps/worker     Background job worker (Railway) — Postgres queue consumer
packages/core   Shared domain types: EDL schema, job contracts, caption
                styles, filler lexicons, tier limits
supabase/       SQL migrations (schema + RLS + storage policies + job queue)
DECISIONS.md    Architectural decision log (append-only)
PROGRESS.md     Per-phase status reports
```

## Getting started

Prereqs: Node 20+, a Supabase project.

1. **Install** — `npm install` (workspace root).
2. **Database** — apply `supabase/migrations/*.sql` to your Supabase project
   (`supabase db push` with the CLI, or paste into the SQL editor in order).
3. **Web env** — copy `apps/web/.env.example` to `apps/web/.env.local` and fill
   in the Supabase URL + anon key.
4. **Worker env** — copy `apps/worker/.env.example` to `apps/worker/.env` and
   set `SUPABASE_DB_URL` (provider keys can wait until their phase).
5. **Run** — `npm run dev` (web, http://localhost:3000) and `npm run dev:worker`
   (worker) in separate terminals.

Arabic is served at `/` (RTL); English at `/en`.

## Deployment

- **Web → Vercel**: root directory `apps/web`; set the two `NEXT_PUBLIC_SUPABASE_*`
  vars (+ `SUPABASE_SERVICE_ROLE_KEY` as a server-only var).
- **Worker → Railway**: Dockerfile deploy with root build context and
  `apps/worker/Dockerfile` as the Dockerfile path; set vars from
  `apps/worker/.env.example`.

## Ground rules (see PRD + DECISIONS.md)

- Every user-facing string goes through `apps/web/messages/{ar,en}.json`. No exceptions.
- Directional CSS uses logical properties/utilities (`ms-*`, `text-start`) — never `ml-*`/`text-left`.
- Runtime AI reasoning uses **Claude Haiku only** (margin constraint).
- No public storage buckets; access via signed URLs + RLS.
- No analytics/tracking/dark patterns.
