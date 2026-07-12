# Build 6B.2 Analysis — Caption Studio + Creator Presets

Date: 2026-07-12 · Written before any code (per build instructions).
Focus: make captions a first-class, brand-aware, creator-customizable system.

**Hard constraints (do NOT touch):**
- **EDL** — `edl.captionStyle` stays a free `string`; no new EDL fields.
- **AI Brain** — no analysis/model changes; captions get no "smart" keyword
  detection this build.
- **Render architecture** — the segment-wise plan, the one-PNG-per-caption-line
  model, and the ffmpeg overlay compositing are untouched. We may draw MORE
  inside each caption PNG and pass a richer spec, but not change how captions
  are planned or composited.

---

## 1. Current caption pipeline (verified in source)

The path from words to burned-in captions, today:

1. **Line grouping** — `buildCaptionLines(words)`
   ([captions.ts](packages/core/src/captions.ts)): groups kept words into lines
   by inter-word timing gaps (>500ms), a char cap (42), and a duration cap
   (5s). Timing-gap based because live Arabic STT returns no punctuation.
2. **Windowing** — `buildExportPlan`
   ([export-plan.ts](packages/core/src/export-plan.ts)): maps each line to an
   OUTPUT-time window and emits one `CaptionOverlayPlan` (`capN.png`) per line,
   clipped per segment. **This is render architecture — untouched.**
3. **Rasterization** — `renderCaptionImages(captions, spec, w, h)`
   ([render/captions.ts](apps/worker/src/render/captions.ts)): draws each line
   to a full-frame transparent PNG on `@napi-rs/canvas` (Skia+HarfBuzz, native
   Arabic shaping). Honors: `fontWeight`, `verticalAnchor`, `textColor`,
   `backgroundColor` (rounded box) OR a drop shadow, `uppercaseLatin`. Font
   size is fixed at `height*0.045`.
4. **Compositing** — the plan overlays each PNG in output-time order (Build
   6B.1: gradient under, lower third over). **Untouched.**
5. **Live preview** — `CaptionOverlay`
   ([caption-overlay.tsx](apps/web/src/components/editor/caption-overlay.tsx)):
   an independent DOM re-implementation over the `<video>` in the editor.

### Discovered gaps (things the analysis must account for)
- **G1 — karaoke doesn't export.** The rasterizer ignores `wordLevel` and
  `highlightColor`; it draws the whole line flat in `textColor`. So
  `karaoke-highlight` *animates in the editor preview but exports as a static
  white line.* True per-word karaoke in export means multiple time-sliced PNGs
  per line → that **is** the render architecture → **out of scope**; we either
  keep karaoke preview-only or give it an honest static line-level look.
- **G2 — captions ignore the Brand Kit.** Caption color/box are hardcoded per
  token; the creator's brand colors never reach captions. Brand-colored
  captions are the single highest-value "creator identity" win available here.
- **G3 — fixed size & position band.** `fontSize` is a constant and
  `verticalAnchor` is per-token; creators can't nudge size or choose
  top/center/bottom. (Bottom-collision with the lower third is already handled
  — `captionSpecAboveLowerThird`, 6B.1.)
- **G4 — preview vs. export drift.** The DOM preview and the canvas rasterizer
  are two separate code paths; any new spec field must be taught to BOTH or the
  editor lies about the result.

---

## 2. Existing style tokens

Four built-in tokens ([captions.ts](packages/core/src/captions.ts)):

| Token | Look | wordLevel |
|-------|------|-----------|
| `bold-yellow-centered` | yellow, 700, center (0.5), uppercase Latin | no |
| `minimal-white-bottom` | white, 500, bottom (0.85), dark box | no |
| `karaoke-highlight` | white + cyan highlight, 700, 0.8 | yes (preview only — G1) |
| `professional-clean` | off-white, 500, low (0.88), no box | no |

`CaptionStyleSpec` fields: `token, fontFamily, fontWeight, verticalAnchor,
textColor, highlightColor?, backgroundColor?, uppercaseLatin, wordLevel`.

Transport of the chosen style:
- `edl.captionStyle: string` (EDL — untouched) — set via the `set-caption-style`
  edit command in the editor.
- `exports.caption_style text` (no CHECK constraint) — snapshotted at export.
- `brand_kits.caption_style_default text` — **CHECK-constrained to the 4
  tokens** (migration 9). Adding tokens requires touching this CHECK.

---

## 3. Brand Kit integration (today vs. target)

**Today:** `brand_kits.caption_style_default` stores one token; the editor page
compiles the kit into an export snapshot but only for *gradient + lower third*
(`exports.brand`). Caption style rides its own token column. Brand colors and
captions never meet (G2).

**Target (6B.2):** a caption preset may declare "use my brand color," resolved
at export time from the creator's brand colors. Because a token can't carry a
resolved color and the EDL/`exports.caption_style` are token-only, the resolved
caption spec needs a **snapshot channel** — mirroring exactly how `exports.brand`
already snapshots branding (Build 6B.1 decision: snapshot at export, never a
live join, so later edits can't change a past render).

---

## 4. Database needs

Migration 10 (additive, backward-compatible):

1. **`exports.caption_config jsonb` (nullable).** The resolved caption spec
   snapshot for this export. **Null = use the `caption_style` token path,
   byte-identical to pre-6B.2.** This is the transport that lets custom/
   brand-colored presets render without touching the EDL.
2. **`caption_presets` table** — creator-saved named presets:
   `id, owner_id (fk profiles), name, base_token, spec jsonb, created_at,
   updated_at`; owner-only RLS (same pattern as `brand_kits`). One creator →
   many presets. Presets are selectable in the editor/export; the chosen
   preset's spec is snapshotted into `exports.caption_config` at export.
   - *Alternative considered:* a `jsonb[]` column on `brand_kits`. Rejected —
     presets are a 1:many, individually-selectable entity; a table gives clean
     per-preset RLS, ordering, and future per-preset feedback. The house "no
     unnecessary tables" rule is about not splitting 1:1 data, which this isn't.
3. **Widen `brand_kits.caption_style_default` CHECK** to include the new
   built-in tokens. *Recommendation:* **drop the CHECK** and rely on the
   app-layer zod enum (`brandKitRowSchema` already `.catch()`es unknown tokens
   to the default) — the column is cosmetic and the CHECK forces a migration
   every time we add a preset. Documented as a decision either way.

No changes to `edl_versions`, transcripts, the render plan, or storage buckets.

---

## 5. Proposed scope

### In scope — "Caption Studio"
- **Expanded built-in preset library** (core data): add curated tokens with
  richer looks (e.g. large-impact w/ outline, brand-box, outline-clean). Data +
  specs only.
- **Richer `CaptionStyleSpec`** (additive-optional fields honored by BOTH the
  rasterizer and the DOM preview — G4): `outline?` (color+width), `fontScale?`
  (size multiplier, bounded), `useBrandColor?` ("text" | "box" — resolved from
  brand at export). No architecture change: still one PNG per line.
- **Brand-aware captions** (G2): brand-color presets resolve the creator's
  primary/accent at export via the `caption_config` snapshot.
- **Creator Presets** (saved): create/name/customize (base + color + position
  band + size scale, within safe bounds) and save; pick per export; set a
  default. Stored in `caption_presets`; snapshotted to `exports.caption_config`.
- **Caption Studio UI**: a dedicated surface (a tab on the Brand Kit page —
  reuses its auth/layout) with large live previews, customization controls, and
  save/set-default; the editor's `CaptionStylePicker` gains the new presets +
  a "my presets" section. Arabic-first, RTL.

### Out of scope (deferred, documented)
- **Animated/karaoke export** (G1) — needs per-word time-sliced PNGs = render
  architecture. Karaoke stays a preview style; its export is an honest static
  line. Revisit when the plan supports intra-line caption timing.
- **Auto keyword highlighting** — needs the AI Brain / semantic tagging.
- **Custom font upload** — font vendoring/licensing; keep IBM Plex Sans Arabic.
- **Per-word manual emphasis in the transcript** — would touch the EDL.
- **Per-video multiple caption styles** — one style per export stays the model.

---

## 6. UX flow

**Caption Studio (new tab on `/dashboard/brand-kit`):**
1. Grid of presets — built-ins + "My presets" — each a live mini-frame (reuse
   the 6B.1 picker visual, extended for outline/size/brand-color).
2. Select one → a larger live preview with editable sample text; controls:
   position band (top/center/bottom), size scale, color (fixed | brand),
   outline on/off.
3. "Save as preset" (names it → `caption_presets`) and "Set as default"
   (→ `brand_kits.caption_style_default`, or a preset pointer).

**Editor / export (unchanged surfaces, richer options):**
- Editor caption picker lists built-ins + saved presets; selecting sets the EDL
  token as today (built-ins) — for a *custom* preset, the editor stores the
  base token in the EDL and the picker remembers the preset id so export can
  snapshot its spec.
- Export panel: the chosen preset's resolved spec (with brand colors applied if
  requested) is written to `exports.caption_config`; `caption_style` keeps the
  base token for backward-compatible display.

**Backward compatibility:** every existing project has `caption_config = null`
→ the renderer uses `resolveStyleSpec(caption_style)` exactly as today. No
existing export changes.

---

## 7. Files to touch

| Area | Files | Change |
|------|-------|--------|
| Core | `captions.ts` | new tokens + specs; extend `CaptionStyleSpec` (optional fields); a `resolveCaptionSpec(config \| token, brand)` helper |
| Core | new `caption-presets.ts` (or in captions.ts) | `captionPresetSpecSchema` (zod) for the snapshot/table `spec` |
| DB | `supabase/migrations/2026071x_caption_studio.sql` | `exports.caption_config`, `caption_presets` table + RLS, widen/drop `caption_style_default` CHECK |
| Worker | `render/captions.ts` | honor `outline`, `fontScale`, resolved brand color; read `caption_config` when present |
| Worker | `handlers/render-export.ts` | resolve caption spec: `caption_config` ?? token; pass to `renderCaptionImages` |
| Web | `caption-style-picker.tsx` | render new spec fields; group built-ins + my-presets |
| Web | new `caption-studio.tsx` + Brand Kit page tab | studio UI (customize, save, default) |
| Web | `editor-view.tsx`, `export-panel.tsx` | carry preset selection → `exports.caption_config` |
| Web | `caption-overlay.tsx` | honor new spec fields (preview parity, G4) |
| i18n | `messages/{ar,en}.json` | `captionStudio.*` additions (Arabic first) |

Untouched: EDL schema, edit commands, AI Brain, export-plan compositing,
transcription, auth, storage.

---

## 8. Risks & mitigations

1. **Preview/export drift (G4)** — every new spec field must be taught to both
   the canvas rasterizer and the DOM preview. *Mitigation:* keep the resolved
   spec shape identical for both; a core `resolveCaptionSpec` is the single
   source; add a core test that the spec round-trips.
2. **`caption_config` trust boundary** — it's rendered by the worker.
   *Mitigation:* validate with a zod schema in the render handler (loud
   `PermanentJobError` on malformed, exactly like `exports.brand` in 6B.1);
   clamp `fontScale` to a safe range.
3. **Backward compatibility** — a stored `null` must render identically.
   *Mitigation:* the token path is unchanged; a regression test asserts a
   null-config export equals the token render.
4. **CHECK-constraint churn** — adding tokens repeatedly edits the CHECK.
   *Mitigation:* drop it, validate tokens in the app (zod enum already
   `.catch()`es); documented as a decision.
5. **RLS on `caption_presets`** — a stranger must not read/edit another
   creator's presets. *Mitigation:* owner-only policies + a `set role
   authenticated` isolation test, same as `brand_kits`.
6. **Scope creep toward karaoke export** — tempting but architectural.
   *Mitigation:* explicitly deferred (G1); karaoke stays preview-only.

---

## 9. Implementation order

1. Core: expand tokens/specs + `resolveCaptionSpec` + preset spec zod + tests.
2. Migration 10: `caption_config`, `caption_presets` + RLS, CHECK decision.
3. Worker: rasterizer honors new fields + `caption_config` path + validation;
   worker tests (null-config identical, custom-config renders, malformed fails,
   RLS isolation).
4. Web: extend picker; Caption Studio tab (customize/save/default); wire
   editor/export to snapshot `caption_config`; preview parity; i18n (ar first).
5. Verify: full suite, typecheck, `next build`, ar/en parity.
6. Docs: `BUILD_6B_2_REPORT.md`, PROGRESS, DECISIONS. Then deploy + live E2E
   (frame-verified branded caption), per the 6B.1 playbook.

---

## 10. Backward-compatibility guarantees (explicit)

- `caption_config = null` ⇒ identical render to today (regression-tested).
- EDL unchanged: `captionStyle` stays a string; old rows valid.
- New built-in tokens are additive; unknown tokens already fall back to the
  default (`resolveStyleSpec` + zod `.catch`).
- No render-architecture change: still one caption PNG per line, same overlay.
