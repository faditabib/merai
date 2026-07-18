# Functional Readiness Report — 2026-07-18

Pre-walkthrough sprint: fixes for the confirmed gaps from
[PRODUCT_INTEGRITY_AUDIT_2026_07.md](PRODUCT_INTEGRITY_AUDIT_2026_07.md).
No redesign, no new features beyond the required operations.

## 1. Upload pipeline — honest limits (the critical blocker's UX fix)

- **`MAX_RAW_UPLOAD_BYTES` now matches reality**: 50 MB (the Supabase
  free-tier global storage limit, empirically confirmed in the audit) —
  the 2 GiB frontend lie is gone. One constant, one comment pointing at the
  Pro upgrade as the single place to raise it.
- **Pre-upload validation** now rejects oversized files instantly with an
  honest, actionable message (ar+en): what happened (over the 50 MB/file
  limit), why (current storage plan — a temporary provider limit), what to
  do (shorter/lower-quality clip). The dropzone hint states the limit up
  front.
- **Mid-transfer rejections classified**: `classifyUploadFailure` detects
  storage 413 / "exceeded the maximum allowed size" / "payload too large"
  responses in both upload flows (single + scenes) and surfaces the size
  message instead of the misleading "check your connection". Everything
  unrecognized stays a network-class failure. Resumable behavior untouched.

## 2. Project lifecycle — rename / delete / archive

- **Migration** `20260718090000_project_archive.sql` (additive, idempotent,
  PGlite-validated, applied live): `projects.archived_at timestamptz` — a
  lifecycle column deliberately separate from pipeline `status`.
- **Rename**: card menu → inline title edit (Enter/blur commits) →
  RLS-scoped owner update (the tags precedent).
- **Archive/restore**: card menu toggle sets/clears `archived_at`; archived
  projects leave the default list; an "المؤرشفة (n)" chip toggles the
  archived view where restore is available.
- **Delete**: card menu → explicit two-tap confirm → `deleteProject` server
  action: ownership proven by an RLS-scoped select, storage objects for all
  uploads/exports (including `.partN` fallback parts) swept via the service
  role, then an RLS-scoped row delete with FK cascade (all six child tables
  verified `on delete cascade`). Optimistic UI with restore-on-failure.
- **Security**: rename/archive run on the owner-scoped client (owner-only
  RLS policies); delete's storage sweep is unreachable without passing the
  RLS ownership select first. No cross-tenant path.

## 3. Error quality

Upload size errors fixed as above (the audit's worst offender). The other
critical failure surfaces were re-checked and already answer
what/why/next-step with translated copy + recovery affordances: processing
failures (project error state + retry, incl. stitch since the hardening
pass), export failures (status + retry via re-export), AI failures
(suggestion error state), permission failures (UX-sprint guidance).

## 4. Dead configuration removed

`dolbyAppKey`, `dolbyAppSecret`, `pixabayApiKey` deleted from
`apps/worker/src/env.ts` (audit-confirmed zero references). The unused env
values remain only in the local `.env` (owner may delete them there).

## 5. Verification

- **Suites**: 273 tests green (118 core + 79 worker + 76 web — includes 6
  new classifier tests; worker PGlite applies the new migration).
  Typecheck ✓ · `next build` ✓ · i18n parity **562 = 562**.
- **Live E2E (throwaway user, cleaned up)**: seeded 3 projects →
  **rename** ("مشروع أ" → "مشروع مُعاد تسميته", persisted in DB) →
  **archive** ("مشروع ب" left the default list, chip "المؤرشفة (1)",
  `archived_at` timestamped in DB) → **delete** ("مشروع ج" two-tap confirm,
  row gone from DB). 
- **No regression**: recording, AI Brain, upload, quota, and billing paths
  are untouched by these changes except where stated; the full suites +
  build pass and the AI pipeline was live-verified hours ago in the
  integrity audit.

## Remaining known limitations

1. **The 50 MB ceiling itself** — now honest, but still the product's
   tightest constraint. Removal requires the Supabase Pro upgrade (owner);
   then raise `MAX_RAW_UPLOAD_BYTES` in one place and relax the copy.
2. **Stitched multi-scene output** can exceed 50 MB even when every scene
   fits (worker-side upload would fail after retries). Mitigated by the
   per-scene cap + total duration cap; fully resolved by the same Pro
   upgrade. Documented, not hidden.
3. Archived projects keep consuming storage (archive ≠ cheaper tier) —
   expected; retention sweeps continue to apply to raw uploads/exports.
4. Stripe keys / prices / webhook remain owner actions (unchanged).
