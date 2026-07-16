# Build 6C.4 Report — Creator Onboarding Wizard

Date: 2026-07-16 · Analysis: [BUILD_6C_4_ANALYSIS.md](BUILD_6C_4_ANALYSIS.md) ·
Parent plan: [BUILD_6C_ANALYSIS.md](BUILD_6C_ANALYSIS.md) §2. Final 6C
sub-build — the capstone that ties 6C.1–6C.3 into a first-run experience.

## 1. What was built

- **Creator Types catalog** (`packages/core/src/creator-types.ts`): 6 personas
  (`content-creator`, `podcast`, `coach`, `doctor`, `educator`, `business`),
  each a pointer to an existing Creator Style + an `ai_preferences.intent`
  seed. Pure `creatorTypeDefaults(id)` resolver. Generic ids only (house-rule
  test extended to types).
- **Onboarding Wizard** (`/dashboard/onboarding`, `OnboardingWizard` client
  component): 4 skippable steps —
  1. **Type** — 6 tappable persona cards; picking one pre-configures the rest.
  2. **Brand basics** — kit name + 3 colors (prefilled from the type's style
     palette; editable — an edit stops re-seeding) + optional logo upload
     (same `brand-assets` path as the Brand Kit form).
  3. **Look** — the 6 `CreatorStylePreview` cards, recommended style chipped
     and pre-selected; switching styles re-seeds colors only if untouched.
  4. **Summary** — style preview + final palette + recommended format, CTAs
     to first upload or dashboard.
- **One guided write on Finish**, all through existing channels:
  `creatorStyleBrandKitPatch` → `brand_kits` upsert (+ name/logo/colors),
  `user_metadata` (`creator_type`, `creator_style`, `onboarding_completed_at`,
  `logo_overlay` when the style carries a placement), and an
  `ai_preferences.intent` upsert. **Skip** writes only the completion flag.
- **Dashboard integration**: until the flag is set, new creators get the
  wizard as the empty state's primary CTA and existing creators a compact
  banner; `BrandSetupNudge` yields to the wizard banner to avoid double-nagging.

## 2. Architecture decisions

- A creator type is a **pointer, not an entity** — it names a Creator Style +
  an intent; no new tables, no new render/export surface, zero migrations.
- Wizard state rides the **same three channels 6A–6C.3 established**
  (brand_kits upsert / user_metadata / ai_preferences) — nothing new to secure
  or migrate; re-running the wizard **edits rather than resets** (identity
  preservation comes from the already-tested `creatorStyleBrandKitPatch`).
- Colors are creator-owned: one manual edit pins them across style switches
  (`colorsEdited`), and the summary shows the final palette.

## 3. Database & worker

Zero migrations. Worker untouched. Render pipeline untouched.

## 4. Tests (160 → 166)

- New `creator-types.test.ts` (6): catalog size/order, referential style +
  intent validity, distinct styles per type, no-real-names guard, resolvers.
- Full suites green: **81 core + 73 worker + 12 web = 166**. Typecheck clean,
  `next build` clean (new route `ƒ /[locale]/dashboard/onboarding`).
- i18n parity gate: **431 = 431** keys (ar/en), Arabic authored first.

## 5. Verification (live backend, dev server, throwaway user)

Throwaway user `e2e-6c4-wizard@…` (admin-created, deleted after — 0 leftovers):

| Step | Result |
|---|---|
| Empty-state CTA | "ابدأ الإعداد" primary + "مشروع جديد" secondary ✓ |
| Step 1 (type) | 6 RTL cards; picked طبيب / صحة ✓ |
| Step 2 (brand) | palette prefilled `#0EA5E9/#E0F2FE/#0369A1` (= medical-trust catalog) ✓ |
| Step 3 (look) | 6 styles; "ثقة طبية" carries the "موصى به" chip, pre-selected ✓ |
| Step 4 (summary) | style + palette + 9:16 ✓ |
| Finish → DB | `brand_kits` = exact medical-trust patch (brand-box caption spec, gradient 0.4/0.3, lower-third bar/bottom-start, wizard name kept) ✓ |
| Finish → metadata | `creator_type: doctor`, `creator_style: medical-trust`, `onboarding_completed_at`, `logo_overlay {enabled, bottom-end, 0.9, 0.18}` ✓ |
| Finish → ai_preferences | `intent: general` ✓ |
| Dashboard after | "نمطك: ثقة طبية" chip; wizard CTA + brand nudge gone ✓ |
| English + mobile | `/en/dashboard/onboarding` at 375×812 renders correctly ✓ |

## 6. Backward compatibility

- No flag → CTA/banner shows; flag set (finish OR skip) → dashboard identical
  to 6C.3. Existing kits: re-run preserves identity fields (tested resolver).
- Zero migrations; all writes additive upserts.

## 7. Deferred

- Seeding `projects.default_aspect_ratio` from the style's format (the export
  panel already defaults sensibly; revisit with Auto Canvas).
- Worker-side anything — the wizard is pure web.

## 8. Production

Deployed with this build's Vercel push (web only — worker unchanged).
