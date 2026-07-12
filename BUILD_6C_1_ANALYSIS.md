# Build 6C.1 Analysis — Tajawal UI + Creator Dashboard + Thumbnails

Date: 2026-07-12 · Analysis before code (per workflow). Parent:
[BUILD_6C_ANALYSIS.md](BUILD_6C_ANALYSIS.md) (approved). This is the first
sub-build — pure productization, **zero migrations, no worker change**.

Scope: (1) migrate the UI font to **Tajawal**, (2) redesign the dashboard into
a **premium creator home**, (3) add **client-side video thumbnails**. Arabic-
first RTL, mobile-first.

---

## 1. Current state (relevant slices)

- **Fonts** — `apps/web/src/app/[locale]/layout.tsx` loads `IBM_Plex_Sans_Arabic`
  (next/font, weights 400/500/700) as `--font-plex-arabic`; `globals.css` maps
  `--font-sans` and `body` to it. **The caption preview** (`CaptionPreview` /
  `CaptionOverlay`) renders text with `fontFamily: "IBM Plex Sans Arabic"`
  (from `spec.fontFamily`), matching the worker's vendored Plex so preview ≈
  export.
- **Dashboard** — `dashboard/page.tsx` (server, force-dynamic): greeting +
  `OnboardingCallout` (when projects exist) + a flat `projects` list (title,
  date, status chip) OR an empty state with `WorkflowSteps`. Query:
  `projects(id, title, status, created_at)`. No thumbnails, no quick actions,
  no brand nudge.
- **App header** — logo link, Brand Kit link, locale switcher, sign-out.
- **Media access** — raw videos live in `raw-uploads/{owner}/{upload}/original.*`;
  owner-RLS allows the authenticated client to `createSignedUrl`. The editor
  already signs raw URLs client-side (proven pattern).

---

## 2. Feature 1 — Tajawal UI font migration

**Goal:** UI switches to Tajawal; **captions do NOT change** (export uses
vendored Plex; the preview must keep matching it).

**Key subtlety (the whole risk of this feature):** the caption preview
references the literal family `"IBM Plex Sans Arabic"`. If we stop loading Plex,
that name stops resolving and the preview silently falls back to a system font
— diverging from the export. **Therefore we keep BOTH fonts loaded:**
- **Tajawal** (next/font) → `--font-sans` + `body` (the UI).
- **IBM Plex Sans Arabic** (next/font, unchanged) → remains available; the
  caption components reference it via a stable **`--font-caption` variable** (or
  the existing Plex variable) instead of the bare literal, so resolution is
  guaranteed regardless of UI font.

**Plan:**
1. `layout.tsx`: add `Tajawal` (`subsets: ["arabic","latin"]`, weights
   400/500/700/800), keep `IBM_Plex_Sans_Arabic`; expose both variables on
   `<html>`.
2. `globals.css`: `--font-sans` → Tajawal; add `--font-caption` → Plex.
3. Caption components (`caption-preview.tsx`, `caption-overlay.tsx`): use
   `var(--font-caption)` for the Plex family so the preview stays on Plex
   (spec.fontFamily kept for the record/worker; the CSS var guarantees the
   browser actually has it).
4. Visual pass: Arabic shaping unchanged for captions; UI reads as Tajawal.

**Complexity:** Low. **DB/worker:** none. **Risk:** caption preview font
resolution (mitigated by the CSS var); one-file-ish, trivially reversible.

---

## 3. Feature 2 — Creator Dashboard

**Goal:** from developer list → premium creator home.

**Layout (mobile-first, RTL):**
```
┌───────────────────────────────────────────────┐
│ Greeting + subtitle                           │
│ Quick actions:  [New video] [Brand Kit]       │
│                 [Caption Studio] [Record·soon] │  ← primary CTAs
├───────────────────────────────────────────────┤
│ Brand setup nudge (only if kit incomplete)    │  ← dismissible-ish, data-driven
├───────────────────────────────────────────────┤
│ Recent videos                                 │
│ ┌────────┐ ┌────────┐ ┌────────┐              │
│ │ thumb  │ │ thumb  │ │ thumb  │  … grid       │  ← ProjectCard w/ thumbnail
│ │ title  │ │ title  │ │ title  │              │
│ │ status │ │ status │ │ status │              │
│ └────────┘ └────────┘ └────────┘              │
└───────────────────────────────────────────────┘
Empty state (no projects): hero + WorkflowSteps (reused)
```

**Components:**
- `QuickActions` — 3 real routes (New video → `/dashboard/new`, Brand Kit,
  Caption Studio → the Brand Kit page's studio section) + a disabled
  "Record — soon" chip (Build 7 placeholder).
- `ProjectCard` — thumbnail (Feature 3) + title + status chip + hover actions
  (Edit for ready, Retry for error). Reuses existing status styles.
- `BrandSetupNudge` — shows only when the kit is missing/incomplete (no colors
  set / no caption default / no logo). Reads the `brand_kits` row (one extra
  server query). Links to Brand Kit. Data-driven; no dismissal storage needed.

**Data:** the dashboard server query gains: the `brand_kits` row (for the
nudge) and each project's latest `video_uploads.storage_path` (for thumbnails)
— resolved with **one** `video_uploads` query ordered by created_at, deduped to
the latest per project in JS (no N+1, no SQL group tricks). **No schema change.**

**Complexity:** Medium (presentational + two reads). **DB/worker:** none.

---

## 4. Feature 3 — Client-side thumbnails

**Goal:** poster frames without any backend, per the approved decision.

**`ProjectThumbnail` (client):**
- Props: `storagePath` (the project's latest ready upload) + a fallback seed
  (title/initial).
- Only ready projects with a video get a real thumbnail; others render a
  branded gradient placeholder with the project initial + status.
- **Lazy:** an `IntersectionObserver` defers work until the card nears the
  viewport. On intersect: `createSignedUrl` (raw-uploads, 1h) → a hidden
  `<video muted preload="metadata" crossOrigin>` → seek to ~1s → draw to a
  `<canvas>` → `toDataURL` → show as the poster; tear down the video.
- **Cache:** a module-level `Map<storagePath, dataUrl>` so re-renders / revisits
  don't re-decode.
- **Fallbacks:** if signing/decoding fails or the frame is blank, keep the
  placeholder (no error surfaced). Aspect: the card frame is fixed
  (`aspect-video`), object-cover.

**Why client-side:** zero migration, zero worker load, no `thumbnails` bucket;
acceptable for typical project counts; worker-generated posters remain the
deferred optimization.

**Complexity:** Medium (the one novel bit). **DB/worker:** none. **Risks:**
- Many videos decoding at once → mitigated by IntersectionObserver + cache +
  only-ready gating.
- Cross-origin canvas taint → signed Supabase URLs are same-eTLD/CORS-enabled
  for GET; set `crossOrigin="anonymous"`; if a frame can't be drawn, fall back
  to placeholder (no broken UI).
- Mobile data/battery → lazy + single seek + teardown; small canvas.

---

## 5. Files to touch

| Area | Files | Change |
|------|-------|--------|
| Font | `layout.tsx`, `globals.css` | add Tajawal (UI) + `--font-caption` (Plex) |
| Caption preview | `caption-preview.tsx`, `editor/caption-overlay.tsx` | use `var(--font-caption)` |
| Dashboard | `app/[locale]/dashboard/page.tsx` | new layout + brand-kit read + uploads read |
| New components | `components/dashboard/quick-actions.tsx`, `project-card.tsx`, `project-thumbnail.tsx`, `brand-setup-nudge.tsx` | the creator home |
| i18n | `messages/{ar,en}.json` | `dashboard.*` additions (Arabic first) |

**Untouched:** EDL, AI Brain, worker, render pipeline, migrations, auth,
Caption Studio internals, Brand Kit form.

---

## 6. i18n (Arabic-first)

New `dashboard.*` keys: `quickActions.{newVideo,brandKit,captionStudio,record,recordSoon}`,
`recentTitle`, `brandNudge.{title,body,cta}`, `card.{edit,retry,export}`,
plus reuse of existing greeting/empty/status keys. Parity gate before commit.

---

## 7. Mobile-first & RTL

- Quick actions: `grid-cols-2 sm:flex` wrap; large tap targets.
- Recent grid: `grid-cols-1 sm:2 lg:3`.
- Logical utilities only (`ms/ps/text-start`); numbers via `useFormatter`.
- Tajawal covers Arabic + Latin; verify at 375 / 768 / 1280 in both locales.

---

## 8. Backward compatibility

- Font swap is UI-only; captions/exports unchanged (Plex retained + var-pinned).
- Dashboard reads existing tables; empty/processing/error states preserved.
- Thumbnails degrade to placeholders; no dependency on new data.
- **Zero migrations. No worker change. No production data risk.**

---

## 9. Implementation order

1. Tajawal font + `--font-caption` pin (+ verify caption preview unchanged).
2. `ProjectThumbnail` (with placeholder fallback).
3. Dashboard layout: QuickActions → ProjectCard grid → BrandSetupNudge →
   empty state; wire the two server reads.
4. i18n (ar first) + parity.
5. Verify: suites, typecheck, `next build`, parity; responsive/RTL pass.
6. Docs (`BUILD_6C_1_REPORT.md`, PROGRESS, DECISIONS) → deploy web → UX check.

---

## 10. Risks (summary)

1. **Caption preview font regression** (the real one) — pin Plex via
   `--font-caption`; visually confirm captions look identical pre/post swap.
2. **Thumbnail decode storms / taint** — lazy + cache + only-ready + graceful
   placeholder.
3. **Dashboard query cost** — 2 bounded reads (brand_kit + latest uploads),
   deduped in JS; force-dynamic already.
4. **i18n drift** — parity gate.
5. **Scope** — 6C.1 is UI-only; Creator Styles/Overlay/wizard are later
   sub-builds (no leakage).

*Proceeding to implementation on approval-in-hand (6C is approved; this
sub-build follows the confirmed order).*
