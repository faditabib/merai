# Build 6B.3 Analysis — Caption Studio UX

Date: 2026-07-12 · Written before any code (per build instructions).
Goal: turn the caption system (developer-shaped tokens) into a creator-facing
**Caption Studio** — a named preset gallery, a live preview with controls, brand
integration, a default preference, and an export "your video style" card.

**Hard constraints (do NOT touch):**
- **EDL** — `edl.captionStyle` stays a `string` token; no new EDL fields.
- **AI Brain** — untouched.
- **No saved custom preset LIBRARY** — a single default *preference* is allowed
  ("store default preference only"), a many-row named-preset store is not.
- **Reuse the 6B.2 `exports.caption_config` snapshot** — no new export transport.
- **Backward compatibility** + **Arabic-first / English parity**.

---

## 1. Current state (after Build 6B.2)

**Pipeline:** words → `buildCaptionLines` → `buildExportPlan` (one PNG per line)
→ `renderCaptionImages(spec)` (Skia/HarfBuzz) → overlay. Unchanged here.

**`CaptionStyleSpec`** ([captions.ts](packages/core/src/captions.ts)) fields:
`token, fontFamily, fontWeight, verticalAnchor, textColor, highlightColor?,
backgroundColor?, uppercaseLatin, wordLevel, outline?, fontScale?,
useBrandColor?`. The rasterizer AND the DOM preview both honor these (6B.2).

**8 tokens today** — developer-named: `bold-yellow-centered`,
`minimal-white-bottom`, `karaoke-highlight`, `professional-clean`,
`bold-impact`, `outline-clean`, `brand-box`, `brand-accent`.

**Transport:**
- `edl.captionStyle: string` (EDL — untouched).
- `exports.caption_config jsonb` (6B.2) — the resolved-spec snapshot; null = the
  token path. **This is our styling channel and needs no change.**
- `brand_kits.caption_style_default text` — the creator's default token (no CHECK
  after migration 10).

**Brand integration (6B.2):** `captionConfigForExport(token, brandColors)`
resolves brand-color presets to a concrete spec; the editor page passes the
kit's colors to the picker / overlay / export panel.

**Editor preview flow:** `CaptionStylePicker` (4-across grid of mini-frames) +
`CaptionOverlay` (live over the video), both fed the same spec + brand colors.

**Brand Kit page:** a caption section already uses `CaptionStylePicker` for
`caption_style_default`, with colors passed for preview.

---

## 2. UX gaps (what makes this "developer feature," not "studio")

| # | Gap |
|---|-----|
| U1 | Presets are **developer-named** ("bold-yellow-centered"), not creator concepts ("Viral", "Podcast"). No use-case guidance, no "which one for me?" |
| U2 | **No interactive controls** — you pick a fixed token; you can't nudge size, color, outline, box, or position and see it. |
| U3 | **No dedicated surface** — captions are a strip in the editor / a section on the Brand Kit page. There is no "Caption Studio." |
| U4 | **Brand integration is implicit** — brand presets exist, but nothing says "use my brand colors" or shows the resolved swatch. |
| U5 | **No pre-export confidence** — the creator can't see "this is what I'm about to render" (caption + brand + format) in one glance. |
| U6 | **Preview trust** — the mini-frame is close but not obviously "the same as export"; a single shared renderer would guarantee it. |
| U7 | **Responsiveness/RTL** — the picker grid is fine, but a studio with controls needs deliberate mobile + RTL layout. |

---

## 3. Proposed model

### 3.1 An 8-preset creator catalog (core data)
A new `CAPTION_PRESETS` catalog in core — the **creator-facing** gallery — each
entry = `{ id, spec: CaptionStyleSpec, animation, useCaseKey }`. The eight, with
their underlying look:

| Preset id | Look (spec) | Animation (label) | Best for |
|-----------|-------------|-------------------|----------|
| `viral` | large, 700, white, thick outline, low-center | Pop | Short-form hooks |
| `podcast` | clean dark box, 500, bottom | Fade | Talking-head episodes |
| `educational` | box, 600, high-legibility, bottom | Fade | Tutorials/explainers |
| `medical` | clean, 500, calm, no box, low | Static | Doctors/clinics |
| `luxury` | light 400, refined off-white, no box, low | Fade | Premium/brand films |
| `minimal` | 500 white, no box, subtle shadow, bottom | Static | Clean vlogs |
| `high-energy` | largest, 700, outline, uppercase, center | Pop | Hype/promos |
| `professional` | 500, subtle box, bottom | Fade | Founders/business |

Each preset **id is added to the resolvable spec map** so `edl.captionStyle` can
carry it and the worker resolves it via the existing token path. The old 8
tokens **remain resolvable** (backward compatibility) but are hidden from the
gallery — existing projects/exports keep rendering exactly as before.

**Animation is a descriptive label + gallery-thumbnail flourish only** — the
render pipeline stays static PNG-per-line (render-architecture constraint;
karaoke/motion export is the deferred G1 from 6B.2). The live *caption* preview
that must "match export" renders statically; the animation chip communicates
intent, and the gallery card may animate the thumbnail decoratively. Documented
so preview/export stay honest.

### 3.2 One shared preview renderer (kills U6)
Extract a single `CaptionPreview` React component that renders a
`CaptionStyleSpec` over a frame — reused by: gallery thumbnails, the live
preview, the editor overlay, and the export card. Its styling is the same spec
the worker rasterizes, so "preview = export" is structural, not coincidental.
(The worker rasterizer is the source of truth; the component mirrors its fields:
color, box, outline via `-webkit-text-stroke`, scale, anchor.)

### 3.3 Live controls (kills U2)
Controls that mutate a working `CaptionStyleSpec`:
- **Font scale** (slider → `fontScale`, clamped 0.6–1.8).
- **Text color** (fixed swatch) **or** **Use my brand color** (→ `useBrandColor`,
  resolved from the kit).
- **Outline** on/off (→ `outline`).
- **Background box** on/off (→ `backgroundColor`).
- **Position**: Top / Center / Bottom (→ `verticalAnchor` 0.12 / 0.5 / 0.85).

The working spec is snapshotted to `exports.caption_config` at export (6B.2
channel — **no new export column**) and stored as the default (below).

### 3.4 Default preference (kills nothing new to DB except one column)
"Set as default" persists the creator's crafted look as their **single** default
— NOT a library. Store it in a new nullable **`brand_kits.caption_default_config
jsonb`** (validated by the existing `captionStyleSpecSchema`). The editor
initializes its caption look from this default; export snapshots the resolved
spec. `caption_style_default` (token) remains the "which preset" pointer for
display/back-compat; the jsonb carries the tuned overrides.
*This is one default config, explicitly not the forbidden preset library.*

### 3.5 Export "your video style" card (kills U5)
In the export panel, before rendering, a compact card:
- **Caption:** preset display name (e.g., "Viral").
- **Brand:** kit name + resolved color swatch (+ a derived color word, e.g.
  "Orange", from a tiny hue→name map — cosmetic).
- **Format:** aspect (9:16 / 1:1 / 16:9).
Built from the resolved caption spec + brand kit + `edl.aspectRatio`.

---

## 4. Files to touch

| Area | Files | Change |
|------|-------|--------|
| Core | `captions.ts` (or new `caption-presets.ts`) | `CAPTION_PRESETS` catalog (+ specs into the resolvable map); `CaptionPresetId`; a `hueName(hex)` helper for the card |
| DB | migration 11 | `brand_kits.caption_default_config jsonb` (nullable) |
| Web (new) | `components/caption-studio.tsx` | gallery + live preview + controls + set-default; a `CaptionPreview` shared piece |
| Web (new) | `components/caption-preview.tsx` | the single spec→frame renderer |
| Web | `caption-style-picker.tsx` | reframe as the gallery (preset cards: thumbnail, name, animation chip, use case) |
| Web | Brand Kit page + form | host the Caption Studio (a section/tab); persist `caption_default_config` |
| Web | `editor-view.tsx`, `export-panel.tsx` | working caption spec + controls; snapshot to `caption_config`; "your video style" card |
| Web | `caption-overlay.tsx` | consume the shared preview logic |
| i18n | `messages/{ar,en}.json` | `captionStudio.*` (preset names, animation labels, use cases, control labels, card) — Arabic first |

Untouched: EDL schema, edit commands, AI Brain, export-plan/compositing,
transcription, storage, worker render pipeline (it already honors every spec
field from 6B.2 — **no worker change expected**).

---

## 5. Backward compatibility

- Old exports: `caption_config = null` → token path unchanged. Old tokens stay
  in the resolvable map. **Zero change to existing renders** (regression-tested).
- `caption_default_config` is nullable/additive; a null default = today's
  behavior (`caption_style_default` token).
- EDL untouched; `edl.captionStyle` still a string; new preset ids are additive
  tokens; unknown tokens already fall back to the default.
- The worker needs **no change** — it already resolves `caption_config ?? token`
  and honors outline/scale/colors (6B.2). This build is UX + one nullable column.

---

## 6. Mobile & RTL (U7)

- Studio layout: gallery grid `grid-cols-2` (mobile) → `3` (tablet) → `4`
  (desktop); the live preview + controls stack on mobile, split on desktop.
- All spacing via logical utilities (`ms-*`, `ps-*`, `text-start`); the preview
  frame is `aspect-video`/`aspect-[9/16]` and `max-w-full`.
- Controls: native range/checkbox/segmented — large tap targets, `dir`-aware.
- Caption text itself is RTL/Arabic-shaped already (Skia + DOM). The **timeline
  stays LTR** (unchanged, not part of this build).
- Verify at 375 / 768 / 1280 in both locales.

---

## 7. Risks & mitigations

1. **Preview/export drift** — mitigated by ONE `CaptionPreview` component fed the
   same `CaptionStyleSpec` the worker rasterizes; a core note keeps the field set
   in sync. (No worker change, so the export side is already proven by 6B.2.)
2. **"Animation" implies motion the export lacks** — animation is a *label*; the
   caption preview renders statically to match export; documented (ties to G1).
3. **Default-config trust** — validated by `captionStyleSpecSchema` on read (app)
   and already at the render boundary (worker, 6B.2). `fontScale` clamped.
4. **Scope creep into a preset library** — explicitly one default config, no
   named-preset table; controls persist only as the single default or per-export.
5. **i18n volume** — ~40 new keys (8 names + 8 use cases + animation labels +
   controls + card). Arabic first; jq parity gate before commit.
6. **RTL control layouts** — logical utilities only; feel-pass at 3 widths ×2
   locales.

---

## 8. Implementation order

1. Core: `CAPTION_PRESETS` catalog + specs into the resolvable map + `hueName`;
   core tests (every preset resolves + validates; back-compat tokens intact).
2. Migration 11: `caption_default_config` (nullable).
3. Web: `CaptionPreview` (shared renderer) → gallery cards → live controls →
   Caption Studio surface on the Brand Kit page → editor working-spec + export
   snapshot → "your video style" card → `caption-overlay` reuse.
4. i18n (ar first) + parity check.
5. Responsive/RTL feel-pass (375/768/1280 ×2 locales).
6. Verify: full suite, typecheck, `next build`, preview/export consistency
   (frame-verified via the deployed worker, per the 6B.1/6B.2 playbook).
7. Docs: `BUILD_6B_3_REPORT.md`, PROGRESS, DECISIONS. Deploy + live E2E.

---

## 9. Deferred (documented, out of scope)

- **Saved custom preset LIBRARY** (many named presets) — future build.
- **Animated / karaoke caption EXPORT** — needs render-architecture (G1).
- **Auto keyword highlighting** — needs the AI Brain.
- **Per-word / per-video persisted styling in the EDL** — would touch the EDL.
- **Custom fonts** — licensing/vendoring.

---

## 10. Backward-compatibility guarantees (explicit)

- `caption_config = null` AND `caption_default_config = null` ⇒ identical render
  to today.
- Old developer tokens remain resolvable; new preset ids are additive.
- EDL, AI Brain, worker render pipeline unchanged.
- New DB surface = one nullable jsonb column (validated, owner-scoped by the
  existing brand_kits RLS).
