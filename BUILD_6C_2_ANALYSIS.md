# Build 6C.2 Analysis — Creator Styles System

Date: 2026-07-12 · Analysis before code. Parent (approved):
[BUILD_6C_ANALYSIS.md](BUILD_6C_ANALYSIS.md). Second 6C sub-build.

Goal: turn editing patterns into **selectable creative identities** — one tap
seeds the whole Brand Kit (captions + colors + overlay + lower third + format)
with a coherent look. Reuses everything from 6B/6C.1; **no new table, no
migration, no worker change**.

**Standing constraints:** no preset DB table · code catalog + apply-resolved-
config into Brand Kit/export snapshots · **no real creator names in product** ·
Arabic-first RTL · no hidden profiles.

---

## 1. Current infrastructure it reuses (nothing new to invent)

| Piece | Shape | How a style uses it |
|-------|-------|---------------------|
| `brand_kits` colors | `primary/secondary/accent` (`#RRGGBB`) | style sets all three |
| `brand_kits.caption_default_config` | `CaptionStyleSpec` (6B.3) | style's caption is a resolved spec |
| `brand_kits.caption_style_default` | token string | = style caption's `token` |
| `brand_kits.overlay_default` | `GradientOverlayConfig {opacity,heightPct,color}` (6B.1) | style's gradient |
| `brand_kits.lower_third_default` | `{name?, title?, subtitle?, accentColor, textColor}` | style sets the **colors**, preserves identity text |
| `projects.default_aspect_ratio` | `9:16 / 1:1 / 16:9` | style's recommended format (soft default) |
| Export path | editor reads kit → `caption_config` + `exports.brand` snapshots | **a style flows to exports with zero new export code** |

**Key consequence:** a Creator Style is *not* a new runtime object — it is a
**bundle that writes existing Brand-Kit fields**. Once applied, the existing
editor→export pipeline (6B.1/6B.3) carries it automatically. This is why 6C.2 is
UI + a core catalog with **no export/worker/DB change**.

---

## 2. Architecture — HYBRID (approved), refined

- **Definitions = a code catalog** in `@merai/core` (`CREATOR_STYLES`), same
  discipline as `CAPTION_PRESETS`/`CREATOR` data: curated, versioned, testable,
  zero migration.
- **Applying = a pure resolver + a Brand-Kit upsert.** Core exposes a **pure**
  `creatorStyleBrandKitPatch(style, existingKit)` → the exact `brand_kits`
  field set to upsert (colors, caption default, overlay, lower-third colors).
  The web calls it and upserts (owner-RLS). Pure = unit-testable, no surprises.
- **Selected style id** → `user_metadata.creator_style` (zero migration; the
  same right-sized store as onboarding/dismissal flags). It powers "your style"
  highlighting and is an **explicit** choice — **not a hidden profile**.
- **Recommended format** → applied as the project `default_aspect_ratio` at
  next project creation (read from `user_metadata.creator_style` → its aspect);
  never silently mutates existing projects.

**`CreatorStyle` (core type):**
```
interface CreatorStyle {
  id: CreatorStyleId;                 // "founder-bold" … (no personal names)
  caption: CaptionStyleSpec;          // resolved caption default
  colors: { primary; secondary; accent };
  overlay: GradientOverlayConfig | null;
  lowerThird: { accentColor; textColor };
  aspectRatio: AspectRatio;           // recommended format
  useCaseKey: string;                 // i18n key
}
export const CREATOR_STYLES: readonly CreatorStyle[];   // 6 entries
```
Names, taglines, use-cases live in `messages/{ar,en}.json`
(`creatorStyles.*`) — **never** in code labels.

---

## 3. The six styles → concrete mapping

Product names are generic (inspiration is an internal reference only, never
shipped). Colors/specs below are the catalog's starting values.

| Style (product) | Caption base (token) | fontScale · outline · box · position | Colors (primary / accent / secondary) | Gradient | Lower-third colors | Format |
|---|---|---|---|---|---|---|
| **Founder Bold** | `bold-impact` | 1.3 · yes · no · center-low | `#111111` / `#FFD400` / `#FFFFFF` | 0.6 / 0.40 | accent `#FFD400`, text `#111111` | 9:16 |
| **Educational Clean** | `educational` | 1.05 · no · box · bottom | `#2563EB` / `#10B981` / `#F3F4F6` | 0.4 / 0.30 | accent `#2563EB`, text `#FFFFFF` | 16:9 |
| **Podcast Classic** | `podcast` | 1.0 · no · box · bottom | `#1F2937` / `#F59E0B` / `#9CA3AF` | 0.5 / 0.35 | accent `#F59E0B`, text `#FFFFFF` | 1:1 |
| **Medical Trust** | `brand-box` (uses brand color) | 1.0 · no · box · bottom | `#0EA5E9` / `#0369A1` / `#E0F2FE` | 0.4 / 0.30 | accent `#0EA5E9`, text `#FFFFFF` | 9:16 |
| **Luxury Minimal** | `luxury` | 0.95 · no · no · low | `#0B0B0B` / `#C6A15B` / `#F5F5F4` | 0.35 / 0.30 | accent `#C6A15B`, text `#F5E9C8` | 9:16 |
| **High Energy Short-form** | `high-energy` | 1.4 · yes · no · center · UPPER | `#EF4444` / `#FACC15` / `#111111` | 0.6 / 0.45 | accent `#EF4444`, text `#FFFFFF` | 9:16 |

Notes:
- **Medical Trust** uses `brand-box` (`useBrandColor: "box"`) so captions carry
  the trust-blue brand color at export — reuses the 6B.3 brand-color channel.
- Every caption cell is a real `CaptionStyleSpec` (the values above expand into
  the full spec, `token` = the base). fontScale is clamped by the existing
  schema (0.5–2.0).
- Colors are `#RRGGBB` (pass `hexColorSchema`); gradient values pass
  `gradientOverlayConfigSchema`; the whole caption spec passes
  `captionStyleSpecSchema`. **Catalog validity is a test.**

---

## 4. Application flow (no hidden profiles)

```
Brand Kit page → "Creator Style" gallery (6 cards)
        │  select
        ▼
Preview panel: caption sample (CaptionPreview) + color swatches +
               mini frame (gradient + lower third) + "what changes" list
        │  Apply Style  (explicit)
        ▼
creatorStyleBrandKitPatch(style, kit) → upsert brand_kits
   • primary/secondary/accent  ← style.colors
   • caption_default_config     ← style.caption   ; caption_style_default ← token
   • overlay_default            ← style.overlay
   • lower_third_default        ← { ...existing (name/title/subtitle KEPT),
                                     accentColor, textColor ← style }
   • user_metadata.creator_style ← style.id        (explicit, visible)
        ▼
Editor reads the kit (6B.1/6B.3) → caption_config + exports.brand snapshots
        ▼
Export renders the style — zero new export code
```

**Preserve-vs-overwrite decision (binding):** applying a style **overwrites the
"look" fields** (colors, caption default, overlay, lower-third colors) but
**preserves identity fields** — `logo_path` and the lower-third `name/title/
subtitle`. So a doctor who set "Dr. Ahmad / Cardiologist" keeps it; only the
band colors restyle. The preview states exactly what will change; "Apply" is an
explicit click (never automatic). Fully reversible via Brand Kit / Caption
Studio afterwards.

---

## 5. Dashboard / onboarding integration

- **6C.2 (this build):** the Creator Style gallery lives as a **section on the
  Brand Kit page** (where brand data lives) + a **dashboard entry** — the
  `BrandSetupNudge` gains/《or a sibling card》 a "Choose your creator style"
  CTA, and the selected style shows as a small "Your style: …" chip on the
  dashboard (from `user_metadata.creator_style`).
- **6C.4 (later):** the onboarding wizard picks a style as step one (this build
  makes that trivial — the wizard just calls the same apply flow).

**Recommended card UX:** a responsive gallery (`grid-cols-1 sm:2 lg:3`), each
card = a `CreatorStylePreview` thumbnail (caption sample on a gradient frame in
the style's colors) + product name + one-line tagline + use-case chip.
Selecting opens the preview panel with "Apply". Mobile-first, RTL, logical
utilities; the timeline/LTR rules are untouched (not in scope).

---

## 6. Technical impact

| Layer | Change |
|-------|--------|
| **Core** | `creator-styles.ts`: `CreatorStyle` type, `CREATOR_STYLES` (6), `CreatorStyleId`, pure `creatorStyleBrandKitPatch(style, kit)`. Exported via index. |
| **Web** | `components/creator-styles.tsx` (gallery + preview + apply); `CreatorStylePreview` (reuses `CaptionPreview` + swatches + mini frame); Brand Kit page section; dashboard chip/CTA; write `user_metadata.creator_style`. |
| **i18n** | `creatorStyles.{names,taglines,useCases}.*` + apply/preview strings (Arabic first). ~25–30 keys. |
| **Brand Kit** | the apply upsert reuses the existing owner-RLS `brand_kits` upsert; no schema change. |
| **Export** | **none** — styles flow through the existing kit→snapshot pipeline. |
| **Worker / render / EDL / AI Brain / DB** | **none.** |

**Tests required (core):**
1. `CREATOR_STYLES` has 6 entries; each caption passes `captionStyleSpecSchema`;
   each color passes `hexColorSchema`; overlay (when present) passes its schema;
   aspect ∈ enum.
2. `creatorStyleBrandKitPatch` merges correctly — sets look fields, **preserves
   an existing lower-third name/title** and does not touch `logo_path`.
3. **No-personal-names guard:** a test asserts no style `id` or (loaded) label
   contains a blocklist of the internal inspiration surnames — protects the PRD
   rule in CI.

---

## 7. Implementation plan (order)

1. Core: `creator-styles.ts` catalog + pure patch resolver + tests (catalog
   validity, merge/preserve, no-names guard).
2. Web: `CreatorStylePreview` (compose `CaptionPreview` + swatches + mini
   frame) → `CreatorStyles` gallery + preview + Apply → Brand Kit page section.
3. Dashboard: "Choose your creator style" CTA + "Your style" chip
   (`user_metadata.creator_style`).
4. i18n (Arabic first) + parity gate.
5. Verify: suites, typecheck, `next build`, parity, responsive/RTL.
6. Docs (`BUILD_6C_2_REPORT.md`, PROGRESS, DECISIONS) → deploy web (no
   migration) → E2E: apply a style → confirm the kit fields + a branded export
   frame-verify through the deployed worker (the style's caption/colors render).

---

## 8. Backward compatibility

- Additive catalog; applying is an explicit user action that upserts existing
  columns. Creators who never apply a style are unaffected.
- No migration, no worker/render/EDL change; existing exports untouched.
- Identity fields (logo, lower-third name) preserved on apply.

---

## 9. Risks & mitigations

1. **Clobbering existing brand colors** — *Mitigation:* preview shows the exact
   change; explicit "Apply"; identity fields preserved; fully reversible in
   Brand Kit/Caption Studio.
2. **Creator-name leakage into product** (PRD violation) — *Mitigation:* generic
   product names only; a CI test asserts ids/labels contain no personal names.
3. **Style ≠ what actually exports** — *Mitigation:* the preview uses the shared
   `CaptionPreview`; the style writes the SAME kit fields the export reads;
   frame-verify a branded export in production (6B playbook).
4. **i18n volume** — *Mitigation:* Arabic-first, grouped `creatorStyles.*`,
   parity gate.
5. **Scope creep** (styles wanting a save/library, or driving onboarding) —
   *Mitigation:* no library (constraint); onboarding is 6C.4 and merely reuses
   this apply flow.
6. **Aspect-ratio default reach** — a creator-level format has no column;
   *Mitigation:* store in `user_metadata`, apply as a soft default at project
   creation, never rewrite existing projects.

---

## 10. Open decisions for approval

1. **Apply semantics:** overwrite look fields + preserve identity (logo,
   lower-third name)? *(Recommended.)*
2. **Format default:** store recommended aspect in `user_metadata` and apply at
   next project creation (no migration) — acceptable, or drop format from 6C.2?
3. **Surface:** Brand Kit page section + dashboard chip/CTA now; full onboarding
   integration in 6C.4? *(Recommended.)*
4. **The six** names/colors/mappings in §3 — approve as the catalog v1, or
   adjust any?

*Stopping after analysis — awaiting approval before implementation.*
