# Build 6B.1 Production Report — Creator Identity Layer, Deployed & Verified

Date: 2026-07-12 · Deployed from `c5fee99` + fix `504a3be` · migration 9 live ·
live E2E through the production Railway worker **PASSED** (branded + unbranded,
frames visually verified). Feature build: [BUILD_6B_1_REPORT.md](BUILD_6B_1_REPORT.md).

## 1. Deployment summary

| Component | Action | Result |
|-----------|--------|--------|
| **Supabase (prod DB)** | Applied migration 9 (`20260711200000_brand_kits.sql`) via a `pg` client over `SUPABASE_DB_URL` (no `supabase`/`psql` on the box) | ✅ `brand_kits` table, `exports.brand` column, `brand-assets` bucket, 4 RLS policies — all verified by a follow-up schema query |
| **Railway worker** | `railway up` (project `merai-worker`, service `worker`, prod) — twice: `c5fee99`, then `504a3be` (the fix) | ✅ deployment `e61be7a7` Online, boots handling `render_export` |
| **Vercel web** | `vercel deploy --prod` (project `merai-web`) | ✅ `READY`, aliased `https://merai-web-pi.vercel.app` (deployment `dpl_H2usLRqvwWmj5K8q2fK2pSTsFsg7`) |

Web serving check: `/` → 200; `/dashboard/brand-kit` and `/en/dashboard/brand-kit`
→ 307 (auth-gate redirect — the new route serves and is protected, not a 404).

## 2. Live E2E — method

The full UI flow needs a logged-in browser session (credential entry is out of
scope for the agent), so the render pipeline was exercised **through the real
deployed worker** via the service role, using a throwaway user and a synthetic
720×1280 clip — **no real creator content touched**, everything cleaned up
after (verified 0 leftover rows/objects).

Flow per export: seed user → project → upload (real MP4 to `raw-uploads`) →
transcript (4 Arabic words) → EDL v1 → Brand Kit (gradient + lower third) →
insert `exports` row → enqueue `render_export` (`{exportId, projectId,
ownerId}`, dedupe `render:{id}`) → the deployed worker rendered it → download →
extract frames with ffmpeg → **inspect the pixels**.

## 3. Live E2E — results

Both exports went `pending → rendering → uploaded` on the production worker.

| Export | Size | Frame @2.0s (speech) | Frame @4.5s (post-speech) |
|--------|------|----------------------|---------------------------|
| **Branded** | 100,638 B | caption + gradient + lower third | gradient + lower third (no caption) |
| **Unbranded** | 93,972 B | caption only, flat background | near-blank flat color |

Verified from the extracted frames:
- **Captions render** — "مرحبا بكم في ميراي" in the `minimal-white-bottom`
  rounded box, correct Arabic shaping (Skia/HarfBuzz).
- **Gradient overlay renders** — smooth transparent→dark band over the bottom
  ~40%, present for the whole clip (visible at 2.0s AND 4.5s).
- **Lower third renders** — «د. أحمد» / «استشاري قلب» with the purple accent
  bar, RTL-anchored to the right edge; present for the whole clip.
- **Download works** — both files downloaded and are valid 6.06s MP4s.
- **Unbranded still works** — identical duration, caption only, no gradient/
  lower third; smaller output. Backward compatibility confirmed in production.

## 4. Live finding (fixed same session) — caption/lower-third collision

First branded render showed the `minimal-white-bottom` caption (vertical
anchor 0.85) **overprinting** the lower-third name band (~0.84–0.92 of frame
height). The layer *order* was correct (lower third on top), but the default
*positions* overlapped — "د. أحمد" printed across the caption text.

**Fix (`504a3be`):** a pure helper `captionSpecAboveLowerThird` lifts a
bottom-anchored caption to anchor 0.74 **only when a lower third is present**;
centered/high styles and the unbranded path are untouched. Wired into
`render-export` before caption rasterization. +4 worker tests (65 total).

**Re-verified in production:** redeployed the worker (`e61be7a7`), re-rendered
the same branded export — the caption now sits clearly ABOVE the lower third,
gradient beneath, all three legible and non-overlapping. This is the pattern
prior builds established: the most valuable findings surface only in a real
render, and get absorbed the same session.

## 5. Final state

- **Commits:** `c5fee99` (web integration + i18n + tests + docs) → `504a3be`
  (caption placement fix). Worker deployed at `504a3be`; web at `c5fee99`
  (the fix is worker-only, so the web deploy is current).
- **Tests:** 133 green (56 core + 65 worker + 12 web).
- **Production data:** clean — the E2E user and all its rows/objects were
  deleted and the deletion verified.

## 6. What is NOT done (out of scope for 6B.1, unchanged)
- Logo compositing into the lower third (stored + previewed; not drawn yet).
- Overlay/lower-third animation (static foundation only).
- AI-aware preset suggestion, export preview/receipt, dashboard redesign.
- Explicitly deferred: Caption Studio 2.0, Overlay Studio, recording,
  teleprompter — none started.

## 7. Follow-ups worth noting
- A **UI-driven** E2E (a human logging into `merai-web-pi.vercel.app`, creating
  a Brand Kit, exporting) remains the one path the agent can't drive; the
  render pipeline it exercises is now production-proven, so this is a
  confidence check rather than a gap.
- The caption-lift threshold (0.74) is a fixed constant; if a future caption
  preset sits even lower or a lower third grows a third line, revisit the
  clearance (noted in `captions.ts`).
