# Build 7.7 Analysis — Project Organization

Date: 2026-07-17 · Analysis before code.

## 1. Scope & the one modeling decision

Tags ARE the organization primitive: a "collection" is a saved point of view
(filter by tag), not a container row. This gives tags + collections +
filtering + search + bulk ops with ONE additive column and zero new tables —
matching how the product already treats presets (curated data over new
entities). A future named-collections table can layer on top without
migration conflicts.

## 2. Database (first migration since 6B — additive, idempotent)

`20260717090000_project_tags.sql`:
- `alter table public.projects add column if not exists tags text[] not null default '{}'`
- GIN index on `tags` (future server-side filtering; cheap now).
Existing owner-update RLS already covers tag writes. PGlite worker tests
apply the file automatically (migration SQL stays test-validated).

## 3. Web

- **Pure lib** (`lib/projects/organize.ts`, tested): `normalizeTag` (trim,
  collapse whitespace, 24-char cap, case-preserving but case-insensitive
  dedupe), `addTag`/`removeTag` (≤12 tags), `allTags` (distinct, sorted),
  `filterProjects` (query matches title OR tags, case-insensitive; active
  tags = OR semantics).
- **`ProjectsExplorer`** (client): search box · tag filter chips (multi,
  OR) · bulk mode (select cards → bulk bar: add tag / remove tag / clear) ·
  the grid. Tag edits write `projects.tags` via the RLS-scoped client
  (the Brand-Kit pattern — no server action needed for owner-scoped column
  updates).
- **`ProjectCard`** converts server → client component (same presentation)
  and gains: tag chips, a per-card tag editor popover, selection checkbox
  in bulk mode (card navigation suppressed while selecting).
- Dashboard passes `tags` through its existing bounded read (one column
  added to the select).

## 4. Files

| File | Change |
|---|---|
| `supabase/migrations/20260717090000_project_tags.sql` (new) | column + GIN |
| `lib/projects/organize.ts` (new) + tests | pure helpers |
| `components/dashboard/projects-explorer.tsx` (new) | search/filter/bulk |
| `components/dashboard/project-card.tsx` | client conversion + tags/selection |
| `app/[locale]/dashboard/page.tsx` | select tags; render the explorer |
| `messages/{ar,en}.json` | `dashboard.organize.*` (ar first) |

## 5. Risks
1. **Client-side filtering scale** — the dashboard already loads all
   projects (bounded, solo-creator scale); the GIN index is ready for the
   server-side move when needed.
2. **Server→client card conversion** — presentation preserved; next-intl
   client hooks replace the server calls; thumbnails were already client.
3. **Migration on live DB** — additive `if not exists`, applied via the
   established `apply-migration.ts`, PGlite-validated first.

## 6. Verification
Unit (normalize/add/remove/filter) · suites (PGlite applies the new
migration) · typecheck/build/parity · live: tag a project, filter by chip,
search, bulk-tag two projects; rows verified in DB.
