# Build 6C Analysis — Creator Experience Layer

Date: 2026-07-12 · Analysis only (no code). Stop for approval after.
Goal: move Merai from "AI video editor" to a **premium Creator SaaS** —
onboarding, creator styles, an overlay studio, a recording *foundation*, and a
creator-grade dashboard.

**Standing constraints (apply to every feature below):**
- Arabic-first RTL · **Tajawal** UI font · mobile-first.
- Keep the existing architecture; **avoid unnecessary migrations**; never break
  production.
- Do NOT touch the EDL model, the AI Brain, or the segment-wise render
  architecture unless a feature genuinely requires it (only Overlay Studio does,
  minimally).

---

## 1. Current-state audit (after 6B.3)

| Area | State today | Reuse leverage for 6C |
|------|-------------|-----------------------|
| **Brand Kit** | `brand_kits` row per creator: name, logo_path (stored, **not composited**), primary/secondary/accent, `caption_style_default`, `overlay_default` (gradient), `lower_third_default`, `caption_default_config` (6B.3). Owner-RLS. | The single home for "creator identity." Creator Styles and onboarding both write here. |
| **Caption Studio** | 8 creator presets (`CAPTION_PRESETS`), a shared `CaptionPreview` renderer (preview=export), `exports.caption_config` snapshot, live controls, one default preference. | Caption half of a Creator Style is already a solved, snapshot-able spec. |
| **Creator presets foundation** | Caption presets only. No cross-domain "style" bundling captions+colors+overlays+export. | 6C's Creator Styles = a bundle that populates the Brand Kit + caption default. |
| **Export branding pipeline** | `exports.brand` snapshot (gradient + lower third) + `exports.caption_config`. Worker composites **video → gradient → captions → lower third**. Logo NOT drawn. Local ffmpeg + VGF engines stage PNGs generically. | Adding a logo/watermark layer is the only real render change 6C needs. |
| **Editor UX** | Functional review editor: player + caption overlay, transcript edit, timeline (LTR-pinned), AI assistant, export panel with the 6B.3 "your video style" card. Developer-ish density. | Solid; 6C polishes chrome, not internals. |
| **Onboarding** | `OnboardingCallout` (6A): a dismissible 4-step strip; flag in `auth user_metadata.onboarding_dismissed_at`. No creator-type wizard, no personalization. | The wizard replaces the callout's role; the metadata-flag pattern extends cleanly. |
| **Database** | 11 migrations. Tables: profiles (display_name, locale, subscription_tier), projects, video_uploads, transcripts, edl_versions, exports, usage_ledger, jobs, ai_suggestions, **ai_preferences** (owner_id, `intent` ∈ auto/short-form/educational/general), brand_kits. Enum-like = text+CHECK. Owner-RLS everywhere; worker = service role. | ai_preferences already stores a creator "intent"; profiles is the natural home for a creator_type if a column is warranted. |
| **i18n** | next-intl, `messages/{ar,en}.json`, **330 keys**, Arabic authored first, jq parity gate. Every user string flows through it. | 6C is copy-heavy (onboarding, styles, dashboard) — parity discipline scales but volume is a cost. |
| **Export/render pipeline** | Pure segment-wise `buildExportPlan` (core) → per-segment input-seeked ffmpeg → `-c copy` join. Captions + brand layers = transparent full-frame PNGs overlaid. Skia/HarfBuzz rasterization with **vendored IBM Plex Sans Arabic**. | Layer-based, PNG-overlay model absorbs a logo layer with no architectural change. |

**Font reality check (Tajawal):** the UI font is `IBM_Plex_Sans_Arabic`
(next/font) mapped to `--font-sans`. The **caption renderer** (worker) uses
**vendored Plex TTFs** for HarfBuzz shaping, and the live caption preview uses
`spec.fontFamily` (= Plex) so preview matches export. **Swapping the UI to
Tajawal is safe and isolated** — it does not touch caption rendering/preview
(those are driven by the spec's font, not the UI font). Vendoring Tajawal into
the *caption* renderer would be a separate, larger decision (new TTFs + visual
Arabic-shaping verification) — recommend **not** doing that in 6C.

---

## 2. Feature area A — Creator Onboarding Wizard

**Intent:** first-run flow where the creator picks a type and Merai
pre-configures sensible defaults.

**Creator types:** Content Creator · Podcast · Coach · Doctor / Medical ·
Educator · Business.

**What each type drives (recommendations):**
| Type | Caption default | Brand palette hint | Export format | Creator Style |
|------|-----------------|--------------------|---------------|---------------|
| Content Creator | Viral / High Energy | bold/high-contrast | 9:16 | Rapid Energy |
| Podcast | Podcast | calm/dark | 1:1 or 16:9 | Podcast Classic |
| Coach | Bold Impact | confident/warm | 9:16 | Bold Founder |
| Doctor / Medical | Medical | clean/trust-blue | 9:16 / 1:1 | Clinical Trust |
| Educator | Educational | clear/legible | 16:9 | Calm Educator |
| Business | Professional | corporate/neutral | 16:9 | Luxury Minimal |

**Data & storage decision:**
- The **completion flag + chosen type** → `auth user_metadata`
  (`onboarding_completed_at`, `creator_type`). Zero migration, cross-device,
  the same right-sized pattern as the 6A dismissal flag. The dashboard already
  loads the user object, so reading it is free.
- The **recommendations it applies** (caption default, palette, overlay) → the
  **existing `brand_kits`** row (upsert) — nothing new. The wizard is a guided
  writer over tables that already exist.
- `ai_preferences.intent` MAY be seeded from the type (e.g., Educator →
  `educational`) — optional, additive, reuses an existing table.

**UX flow (4–5 steps, skippable, ~60–90s):**
1. Welcome + "what do you create?" (6 type cards, one tap).
2. Brand basics (name + 1–3 colors, prefilled from the type's palette; logo
   optional).
3. Caption style (Caption Studio gallery, pre-selected by type; live preview).
4. Format + a one-line "here's your look" summary card (reuses "your video
   style" card).
5. CTA → upload first video (or land on the new dashboard).

**Backward compatibility:** existing users have no `creator_type` → they see
the current dashboard/callout; nothing changes. The wizard shows only when
`onboarding_completed_at` is absent AND the user opts in (or on first project).
No migration, no data backfill.

**Complexity:** Medium (mostly UI + i18n; writes to existing tables).

---

## 3. Feature area B — Creator Presets ("Creator Styles")

**Intent:** one-tap "styles" that bundle captions + colors + overlays + lower
third + export settings — *inspired by* recognizable editing patterns, never
copying a person's branding or name.

**⚠️ Naming constraint (binding, from the PRD & captions.ts house rule):**
real creators' names are internal visual references ONLY and must **never**
appear in product copy or code identifiers. So the catalog ships with generic
names:
| Internal inspiration (reference only) | Product name (shipped) |
|---|---|
| Hormozi-style | **Bold Founder** |
| Gary Vee-style | **Rapid Energy** |
| Ali Abdaal-style | **Calm Educator** |
| Iman Gadzhi-style | **Luxury Minimal** |
| Podcast-style | **Podcast Classic** |
| Medical-style | **Clinical Trust** |
| Luxury-brand-style | **Prestige** |

**A Creator Style maps to:**
| Domain | Field(s) it sets | Mechanism |
|--------|------------------|-----------|
| Captions | `caption_default_config` (a `CaptionStyleSpec`) | existing 6B.3 channel |
| Colors | `primary/secondary/accent` | brand_kits columns |
| Gradient overlay | `overlay_default` | brand_kits column (6B.1) |
| Lower third | `lower_third_default` (template shape) | brand_kits column (6B.1) |
| Logo/watermark | opacity/position defaults | needs Overlay Studio (§4) |
| Export settings | default aspect ratio | `projects.default_aspect_ratio` (exists) |

**Architecture decision — tokens vs DB vs hybrid → HYBRID (recommended):**
- **Definitions = code/tokens** in `@merai/core` (a `CREATOR_STYLES` catalog,
  same shape discipline as `CAPTION_PRESETS`): curated, versioned, testable,
  zero migration, no per-row style storage.
- **Applying a style = a DB write to the existing `brand_kits`** row (populate
  colors + caption default + overlay + lower third). The creator can then tweak
  in Brand Kit / Caption Studio. "Apply Style" is a bundled Brand-Kit upsert.
- **No new table.** A style is not user-authored data (that's the deferred
  saved-preset library); it's a curated bundle that seeds editable Brand-Kit
  fields. This is the cleanest, migration-free path and mirrors how 6B.3's
  default config already works.

**Backward compatibility:** additive catalog; applying a style is an explicit
user action that upserts brand_kits (already RLS-safe). Nothing auto-changes.

**Complexity:** Medium (core catalog + an "apply" flow + previews; leans hard
on existing Brand Kit/Caption Studio).

---

## 4. Feature area C — Overlay Studio

**Intent:** a professional overlay system with a **logo/watermark** layer added
to the existing gradient + lower third, plus more gradient/lower-third
templates.

**Layer order — current vs proposed (needs a decision):**
- **Current (6B.1):** video → gradient → **captions → lower third** (lower
  third on top; fixed by the 6B.1 collision finding).
- **6C brief diagram:** video → gradient → lower third → captions → logo.
- **Recommendation:** keep captions ABOVE the lower third (readability won that
  argument live in 6B.1), and add the **logo/watermark as the topmost layer**:
  **video → gradient → lower third → captions → logo**. Document the deviation
  from the brief's ordering with the 6B.1 rationale.

**The one real render change in 6C:** compositing the **logo**. The logo is
already stored (`brand_kits.logo_path`) but never drawn (deferred in 6B.1).
Work:
- Core `buildExportPlan`: add an optional logo layer (a stored PNG input,
  overlaid at a corner with opacity) — the plan already chains N overlay
  inputs, so this is an additive input + one `overlay=x:y` per segment. No
  architectural change.
- Worker: fetch/stage the logo (signed URL from `brand-assets`), resize to a
  target width, apply opacity; extend `renderBrandImages` / the export snapshot
  (`exports.brand`) with a `logo` block `{ enabled, opacity, position, widthPct
  }`. Malformed → PermanentJobError (same trust-boundary rule).
- Export snapshot: `exports.brand` is already jsonb — **add a `logo` key, no
  migration**. Editor page resolves the logo (signed URL → the worker signs its
  own at render; the snapshot carries the storage path + placement).

**Gradient/lower-third templates:** more curated presets (data), plus
Medical/Podcast lower-third templates — pure additions to the existing
`overlay_default` / `lower_third_default` shapes. No schema change.

**Render pipeline impact:** LOW-MEDIUM — one new overlay input + one worker
rasterization step (logo resize/opacity via Skia). No change to the
segment-wise model, the join, or the engines (both stage PNGs generically).

**Risk:** logo aspect/size variance and RTL corner placement (start-side vs
physical corner) — mirror the lower-third's logical anchoring logic.

**Complexity:** Medium (worker + core + snapshot, but all additive and
pattern-matched to 6B.1).

---

## 5. Feature area D — Tella-style Recording (architecture ONLY, do not build)

**Intent:** future in-browser recording suite. Analyze feasibility & roadmap
position only.

**Capabilities & browser APIs:**
| Feature | API | Feasibility |
|---------|-----|-------------|
| Camera + mic capture | `getUserMedia` | High (standard) |
| Screen capture | `getDisplayMedia` | High (desktop browsers; weak on mobile Safari) |
| Recording | `MediaRecorder` (WebM/VP8-9/Opus) | High; **codec/container variance** across browsers (Safari MP4/H.264) |
| Scenes/shots | app-level: each take = its own recorded blob | High (state + storage design) |
| Retake one scene | re-record a scene blob, keep others | High conceptually; needs a scene model |
| Scene timeline | UI over ordered scene blobs | Medium |
| Teleprompter | scrolling text overlay during capture | High (pure UI) |

**Storage requirements:** each scene take is a media blob uploaded to
`raw-uploads` (tus, already in place). Multiple takes multiply storage — needs
a retention/cleanup policy and a per-scene upload model. A recording is
effectively **N uploads → 1 project**, which the current `video_uploads`
(one-per-project-ish) and the transcription pipeline (single source) would need
to generalize. This is a **substantial** data-model and pipeline change.

**Why it does NOT belong in 6C:** it introduces a new capture subsystem, a
multi-clip project model, browser-codec normalization, and a stitch/concat
render path — orthogonal to 6C's productization goals and heavier than all of
6C combined.

**Roadmap position:** **Build 7 ("Creator Studio / Recording")**, after 6C
ships the SaaS experience. 6C may lay only trivial groundwork: a "Record"
placeholder entry in the dashboard quick actions that routes to a "coming soon"
state (no capture code). Recommend: analyze now, build later.

**Complexity:** High (own build). **6C scope: none (foundation note only).**

---

## 6. Feature area E — Product UX Upgrade (dashboard → premium SaaS)

**Current:** dashboard = greeting + a flat project list (title/date/status
chip) + dismissible onboarding strip + empty state. Editor-oriented.

**Target creator dashboard:**
| Block | Content | Data source |
|-------|---------|-------------|
| Hero / quick actions | New Video · Brand Kit · Caption Studio · (Record → soon) | static + routes |
| Recent videos | thumbnail grid, status, one-click Edit/Export | `projects` (+ thumbnail gap, below) |
| Creator Styles | "apply a style" entry | §3 catalog |
| Brand setup | completeness nudge (colors/logo/caption set?) | `brand_kits` |
| Empty states | premium, guiding (reuse WorkflowSteps) | static |

**The one data gap — thumbnails:** projects have no poster image. Options:
(a) client-side canvas grab of the first frame when a signed URL is available
(zero backend, lazy); (b) a worker poster-frame step during analysis (ffmpeg
already present) writing to a `thumbnails` bucket; (c) placeholder now. **Recommend
(a) for 6C** (no migration, no worker change) with (b) as a later optimization.

**Tajawal + mobile-first + RTL:**
- Swap the UI font to **Tajawal** (`next/font/google`), remap `--font-sans`
  and the body font; **caption rendering/preview stay on IBM Plex Sans Arabic**
  (spec-driven) — no visual regression to exports. One-file change + a visual
  pass.
- Mobile-first: the dashboard/wizard/studio use responsive grids
  (`grid-cols-1 sm:2 lg:3/4`) and logical utilities; the editor timeline stays
  LTR-pinned (unchanged).

**Complexity:** Medium (mostly presentational; thumbnails via client canvas is
the only mildly novel bit).

---

## 7. Database impact (summary)

| Feature | DB change | Migration? |
|---------|-----------|------------|
| Onboarding wizard | `user_metadata.creator_type` + `onboarding_completed_at`; recommendations upsert existing `brand_kits`; optional `ai_preferences.intent` seed | **None** |
| Creator Styles | code catalog; "apply" upserts existing `brand_kits` | **None** |
| Overlay Studio | `exports.brand` gains a `logo` key (jsonb — additive); Brand Kit logo placement in existing columns/jsonb | **None** (jsonb is free-form) |
| Dashboard/thumbnails | client-side first-frame; no storage of thumbnails in 6C | **None** |
| Tajawal / mobile / RTL | none | **None** |

**Headline: 6C can ship with ZERO migrations** (matches the "avoid unnecessary
migrations" constraint). The only place a migration would appear is IF we later
choose worker-generated thumbnails (a `thumbnails` bucket) — deferred.

---

## 8. Technical complexity matrix

| Feature | UI | Core | Worker | DB | Overall |
|---------|----|------|--------|----|---------|
| A. Onboarding wizard | High | Low | — | None | **Medium** |
| B. Creator Styles | Medium | Medium (catalog) | — | None | **Medium** |
| C. Overlay Studio (logo) | Medium | Medium (plan) | Medium (rasterize) | None | **Medium** |
| D. Recording | — | — | — | — | **Deferred (Build 7)** |
| E. Dashboard + Tajawal | Medium-High | Low | (opt. later) | None | **Medium** |

No feature is individually High for 6C; the risk is **breadth**, not depth.

---

## 9. Feature prioritization & recommended implementation order

Sequenced so each sub-build ships independently, lowest-risk first, each
verifiable end-to-end (analysis → build → live frame/UX check, the 6B playbook):

1. **6C.1 — Foundation & polish (no migration):** Tajawal UI font + dashboard
   redesign (quick actions, recent videos, brand-setup nudge, premium empty
   states) + client-side thumbnails. *Pure productization; highest visible
   value, lowest risk.*
2. **6C.2 — Creator Styles:** core `CREATOR_STYLES` catalog + "Apply a style"
   flow that seeds the Brand Kit (colors + caption default + overlay + lower
   third). Reuses 6B entirely. *(Depends on Overlay Studio only for the logo
   field; ship style bundles without logo first, add logo when 6C.3 lands.)*
3. **6C.3 — Overlay Studio (logo layer):** the single render change — composite
   the stored logo/watermark (+ gradient/lower-third templates). Worker +
   core + `exports.brand.logo`. Frame-verified via the deployed worker.
4. **6C.4 — Onboarding wizard:** creator-type selection → applies a Creator
   Style + seeds Brand Kit; metadata flags. *Lands last so it can recommend the
   full set (styles + overlays) built in 6C.1–6C.3.*
5. **6C.5 (analysis carry-over):** recording remains **Build 7**; 6C.4 leaves a
   "Record (soon)" quick action only.

**Rationale:** 6C.1 delivers the "premium SaaS" feel immediately with no
backend risk; styles/overlays build the substance; the wizard is the capstone
that ties them into a first-run experience.

---

## 10. Risks & mitigations

1. **Breadth/scope creep** — five areas invite a mega-build. *Mitigation:* the
   sub-build sequence (§9); each is independently shippable and reversible.
2. **Tajawal regressions** — a global font swap can shift layouts / Arabic
   shaping. *Mitigation:* UI-only swap; captions stay on Plex (spec-driven);
   visual pass at 3 widths ×2 locales; it's a one-file, easily-reverted change.
3. **Logo render variance** — arbitrary logo aspect/transparency/size on real
   footage. *Mitigation:* clamp target width, preserve aspect, RTL-aware corner
   (logical anchoring like the lower third), validate the snapshot, and
   frame-verify via the deployed worker before shipping.
4. **Creator-name misuse** — "Hormozi/Gary Vee" leaking into product copy
   violates the PRD. *Mitigation:* generic product names only (§3); a lint/test
   asserting the style ids/labels contain no personal names.
5. **Thumbnail cost/perf** — client-side first-frame grabs N signed URLs +
   decodes. *Mitigation:* lazy, viewport-gated, cached; placeholder fallback;
   worker-side posters deferred as the optimization.
6. **i18n volume** — onboarding + styles + dashboard add many keys. *Mitigation:*
   Arabic-first, parity gate per sub-build, group namespaces (`onboarding.*`,
   `creatorStyles.*`, `dashboard.*`).
7. **Recording temptation** — pressure to start capture in 6C. *Mitigation:*
   explicitly Build 7; 6C ships only a routed placeholder.
8. **Backward compatibility** — existing creators must be untouched.
   *Mitigation:* every 6C change is additive/opt-in; null/absent = current
   behavior; zero migrations means zero data risk.

---

## 11. Explicit scope boundaries for 6C

**In:** Tajawal + dashboard redesign + client thumbnails (6C.1) · Creator Styles
catalog & apply (6C.2) · Overlay Studio logo layer + templates (6C.3) ·
Onboarding wizard (6C.4).

**Out (deferred):** recording/capture suite & teleprompter (Build 7);
worker-generated thumbnails; saved *custom* preset/style library (user-authored);
animated/karaoke caption export; vendoring Tajawal into the caption renderer;
any EDL/AI-Brain/render-architecture change beyond the additive logo layer.

---

## 12. Open decisions for approval

1. **Layer order:** keep captions above the lower third (6B.1 readability) and
   put the logo on top — i.e., video → gradient → lower third → captions → logo
   — vs. the brief's exact order? *(Recommend the former.)*
2. **Creator Style storage:** confirm **hybrid** (code catalog + apply-to-Brand-Kit),
   no new table.
3. **Onboarding storage:** confirm `user_metadata` for type/flag (no migration)
   vs. a `profiles.creator_type` column (tiny migration, queryable).
4. **Thumbnails:** confirm client-side first-frame for 6C (worker posters later).
5. **Sub-build order:** confirm 6C.1 → 6C.2 → 6C.3 → 6C.4, recording → Build 7.

*Awaiting approval before implementation.*
