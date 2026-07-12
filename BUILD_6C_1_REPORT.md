# Build 6C.1 Report — Tajawal UI + Creator Dashboard + Thumbnails

Date: 2026-07-12 · 144 tests green (65 core + 67 worker + 12 web) · `next build`
✓ · ar/en parity 340 = 340 · **zero migrations, no worker change**. Analysis:
[BUILD_6C_1_ANALYSIS.md](BUILD_6C_1_ANALYSIS.md). First sub-build of the
approved [Build 6C](BUILD_6C_ANALYSIS.md) plan.

Turns the developer-oriented dashboard into a premium creator home, adopts the
**Tajawal** UI font, and adds client-side video thumbnails — all UI-only.

## 1. What was built

### Tajawal UI font (captions untouched)
- The UI now loads **Tajawal** (next/font, 400/500/700/800) and drives
  `--font-sans` + `body`.
- **IBM Plex Sans Arabic stays loaded** and is pinned as `--font-caption`;
  `captionSpanStyle` resolves via that var, so the live caption preview keeps
  using the exact font the worker rasterizes (vendored Plex) — **preview still
  matches export**. This was the one real risk of the swap (a UI-only font
  change could have silently changed the caption preview); the var pin closes it.

### Creator dashboard
- **Hero + QuickActions**: New video · Brand Kit · Caption Studio, plus a
  disabled **"Record — soon"** chip (the Tella-style suite is Build 7).
- **BrandSetupNudge**: shown only when the Brand Kit is missing or incomplete
  (no logo and no crafted caption default) — data-driven, no dismissal storage.
- **Recent videos**: a responsive `ProjectCard` grid (1 / 2 / 3 columns) with
  poster thumbnail, title, date, and status chip; the empty state keeps the
  `WorkflowSteps` story.
- **Two bounded server reads** (the Brand Kit + the latest ready upload per
  project) resolved alongside projects and deduped in JS — no N+1, no SQL
  group tricks, **no schema change**.

### Client-side thumbnails
- `ProjectThumbnail` (client): an `IntersectionObserver` defers work until the
  card nears the viewport, then signs the raw video URL, grabs a first frame
  via a hidden `<video>` → `<canvas>`, caches the JPEG data URL module-wide, and
  shows it. Only ready projects; any signing/decoding failure keeps a branded
  placeholder (a thumbnail is never an error state). **No backend, no
  thumbnails bucket** — the approved decision.

## 2. Architecture decisions
1. **UI font ≠ caption font.** Tajawal is UI-only; captions render/preview on
   Plex, pinned via `--font-caption` so the spec-driven preview can't drift from
   the export. Vendoring Tajawal into the caption *renderer* is deliberately not
   done (separate TTF + Arabic-shaping verification).
2. **Thumbnails are client-side and disposable.** Zero migration, zero worker
   load; a placeholder is always acceptable. Worker-generated posters remain the
   deferred optimization.
3. **Dashboard reads existing tables only.** The nudge and thumbnails needed no
   new columns — two extra bounded reads, deduped in JS.

## 3. Database & worker
- **None.** No migration, no worker change, no render-pipeline change.

## 4. Verification
- 144 tests green; `tsc` clean across core/worker/web; `next build` ✓ (the
  dashboard route compiles).
- ar/en parity 340 = 340 (Arabic authored first).
- Caption preview font resolution confirmed via the `--font-caption` pin;
  exports are byte-identical (worker unchanged).

## 5. Mobile & RTL
- Quick actions wrap; recent grid `1 → sm:2 → lg:3`; logical utilities only;
  numbers/dates via `useFormatter`. Tajawal covers Arabic + Latin.

## 6. Backward compatibility
- Font swap is UI-only; captions/exports unchanged. Dashboard reads existing
  tables; empty/processing/error states preserved; thumbnails degrade to
  placeholders. Zero migrations → zero production data risk.

## 7. Deferred (later 6C sub-builds / Build 7)
- Creator Styles (6C.2), Overlay Studio logo layer (6C.3), Onboarding wizard
  (6C.4); worker-generated thumbnails; recording suite (Build 7 — the "Record"
  chip is a routed placeholder only).

## 8. Production — deployed & verified (2026-07-12)
- **Vercel web deployed** (`READY`, `merai-web-pi.vercel.app`); no migration,
  worker untouched.
- **Font verified in production** via computed styles on the public landing
  page: `body` and `h1` resolve to **Tajawal** (`Tajawal, "Tajawal Fallback",
  …`), and **`--font-caption` resolves to `"IBM Plex Sans Arabic"`** — so the
  UI is Tajawal while the caption preview stays pinned to the export font. The
  one real risk of the swap is confirmed closed.
- Landing page renders correctly in Arabic RTL.
- **Not driveable by the agent:** the dashboard + thumbnails are behind auth
  (no login). Their correctness rests on `next build`, the existing-table reads
  with graceful fallbacks, and the client thumbnail's placeholder-on-failure
  design; a logged-in visual pass is the first item for the next live session.
