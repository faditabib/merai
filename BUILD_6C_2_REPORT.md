# Build 6C.2 Report — Creator Styles System

Date: 2026-07-12 · 150 tests green (71 core + 67 worker + 12 web) · `next build`
✓ · ar/en parity 365 = 365 · **zero migrations, no worker/render change**.
Analysis: [BUILD_6C_2_ANALYSIS.md](BUILD_6C_2_ANALYSIS.md). Second sub-build of
the approved [Build 6C](BUILD_6C_ANALYSIS.md) plan.

Creator Styles are a pure **productization layer** over Brand Kit + Caption
Studio: one tap seeds a whole coherent look (colors + caption + gradient), and
it flows to exports through the existing snapshot pipeline — no new rendering.

## 1. What was built

### Core catalog (hybrid, no table)
`creator-styles.ts`: a `CreatorStyle` type and `CREATOR_STYLES` catalog of six —
**Founder Bold · Educational Clean · Podcast Classic · Medical Trust · Luxury
Minimal · High Energy**. Each is a real `CaptionStyleSpec` (based on a Caption
Studio preset) + primary/secondary/accent colors + a gradient overlay +
lower-third colors + a recommended aspect ratio. Names live in i18n; product
copy is generic (internal inspirations never ship).

`creatorStyleBrandKitPatch(style, kit)` — a **pure** resolver returning the
exact `brand_kits` fields to write: it **overwrites the look** (colors, caption
default, overlay, lower-third colors) and **preserves identity** (the
lower-third name/title/subtitle; `logo_path` untouched).

### One-click apply (the transformation feel)
- `CreatorStylePreview`: a one-frame look — the style's tinted background +
  gradient + a caption sample styled by the **same `captionSpanStyle` the export
  uses** (brand color resolved from the style's palette), so the preview matches
  what ships.
- `CreatorStyles` gallery (6 cards: preview, name, tagline, use-case, swatches,
  Apply) sits atop the Brand Kit form. **Apply seeds the form's live state**
  (colors + caption spec + gradient), so the entire Brand Kit preview transforms
  instantly. Saving the form persists it and records
  `user_metadata.creator_style`.
- Dashboard shows a **"Your style: …" chip** from the explicitly-applied style,
  linking back to the Brand Kit.

## 2. Architecture decisions
1. **Styles are bundles that write existing kit fields — not a new object.**
   Once applied, the 6B.1/6B.3 editor→export pipeline carries them. That's why
   6C.2 has **no export/worker/DB change**.
2. **Apply into the form's live state, not a silent DB write.** The creator sees
   the transformation immediately and commits with Save — no page-refresh/state
   mismatch, and identity fields are preserved.
3. **No hidden profiles.** Applying is an explicit action; the style id stored in
   `user_metadata` is the creator's own visible choice.
4. **Generic names only**, enforced by a CI test that rejects real creator names
   in style ids (the PRD house rule).

## 3. Database & worker
- **None.** No migration; `brand_kits` upsert uses existing columns; the style id
  rides `user_metadata`; the render pipeline is untouched.

## 4. Tests (144 → 150)
- **Core (+6)** — catalog has 6 entries, each caption/colors/overlay/aspect
  valid against the existing schemas; `getCreatorStyle` resolves/rejects;
  `creatorStyleBrandKitPatch` writes the look and **preserves an existing
  lower-third name/title**; the **no-creator-names guard** on ids.

## 5. Verification
- 150 tests green; `tsc` clean across core/worker/web; `next build` ✓; ar/en
  parity 365 = 365 (Arabic first).

## 6. Backward compatibility
- Additive catalog; applying is explicit and reversible in Brand Kit / Caption
  Studio. Creators who never apply a style are unaffected. Zero migrations, no
  render change → no production data risk.

## 7. Deferred
- Onboarding wizard that picks a style as step one (6C.4 — reuses this apply
  flow) · Overlay Studio logo layer (6C.3) · a saved custom-style library.

## 8. Production — deployed & verified (2026-07-12)
- **Vercel web deployed** (`READY`, `merai-web-pi.vercel.app`); no migration,
  worker untouched.
- **Render E2E through the deployed worker** (throwaway user + synthetic clip,
  cleaned up, 0 leftovers): the **Founder Bold** style's resolved look —
  `bold-impact` caption (scale 1.3, low-center, outlined) + its gradient — was
  snapshotted to `caption_config` + `exports.brand` and **frame-verified**:
  large white outlined caption over the bottom readability gradient, one
  cohesive branded frame. Confirms a Creator Style flows to a coherent export
  through the existing pipeline with no new render code.
- Dashboard/Brand-Kit apply UX is behind auth (not agent-driveable); its
  correctness rests on `next build`, the core catalog/patch tests, and the
  form's live-state apply.
