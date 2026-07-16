# Build 6C.4 Analysis — Creator Onboarding Wizard

Date: 2026-07-16 · Analysis before code. Parent (approved):
[BUILD_6C_ANALYSIS.md](BUILD_6C_ANALYSIS.md) §2. Fourth and final 6C sub-build —
the capstone that ties 6C.1 (dashboard), 6C.2 (Creator Styles), and 6C.3
(Overlay Studio) into a first-run experience.

**Standing constraints:** Arabic-first RTL · Tajawal UI · mobile-first ·
**zero migrations** · never break production · reuse existing systems
(Creator Styles resolver, Brand Kit upsert, `user_metadata` pattern) ·
preview = export.

---

## 1. Current state (what the wizard composes — nothing new to invent)

| Piece | Exists as | Reused by the wizard |
|---|---|---|
| Creator Styles catalog | `CREATOR_STYLES` (6 styles) + `creatorStyleBrandKitPatch` (pure, tested) | The wizard's "look" step + the apply write |
| Brand Kit persistence | owner-RLS `brand_kits` upsert (`onConflict: owner_id`) in `brand-kit-form.tsx` | Same upsert shape, same field names |
| Style preview | `CreatorStylePreview` (uses `captionSpanStyle` = export parity) | Step 3 gallery + summary card |
| Per-user UX flags | `auth user_metadata` (`onboarding_dismissed_at` 6A, `creator_style` 6C.2, `logo_overlay` 6C.3) | `creator_type` + `onboarding_completed_at` |
| AI intent | `ai_preferences` upsert (`owner_id`, `intent` ∈ `AI_INTENTS`) — panel already upserts | Optional seed from creator type |
| Logo upload | `brand-assets` bucket upload in Brand Kit form | Optional logo step (same object path) |
| Dashboard entry | Empty state + `QuickActions` + `BrandSetupNudge` (6C.1) | Wizard CTA for new creators |

## 2. Design

### 2.1 Creator types (core catalog — the one new pure piece)

`packages/core/src/creator-types.ts`: `CREATOR_TYPES` — 6 entries mapping the
approved personas to existing Creator Styles + an AI intent seed:

| Type id | Creator Style | `ai_preferences.intent` seed |
|---|---|---|
| `content-creator` | `high-energy` | `short-form` |
| `podcast` | `podcast-classic` | `general` |
| `coach` | `founder-bold` | `short-form` |
| `doctor` | `medical-trust` | `general` |
| `educator` | `educational-clean` | `educational` |
| `business` | `luxury-minimal` | `general` |

Pure resolver `creatorTypeDefaults(id)` → `{ style, intent }` (style resolved
via `getCreatorStyle`; throws never — returns undefined for unknown ids).
Same catalog discipline as `CREATOR_STYLES` (tested, generic names only).

### 2.2 Wizard UX (4 steps, skippable, ~60–90s)

Route: **`/dashboard/onboarding`** (server page → `OnboardingWizard` client
component). Steps:

1. **Type** — "What do you create?" 6 tappable cards (icon + name + one-liner).
   Picking a type pre-selects everything downstream.
2. **Brand basics** — kit name + 3 colors (prefilled from the type's style
   palette; editable) + optional logo upload (same `brand-assets` path as the
   Brand Kit form).
3. **Your look** — the 6 `CreatorStylePreview` cards with the recommended one
   pre-selected (a "recommended" chip); tapping another switches. Colors chosen
   in step 2 are kept — the style drives caption/overlay/lower-third defaults;
   custom colors win if the creator changed them (they can always restyle later
   in Brand Kit).
4. **Summary** — "here's your look": style preview + palette dots + recommended
   format chip → two CTAs: **Upload your first video** (`/dashboard/new`) or
   **Go to dashboard**.

Progress dots; Back on every step; **Skip** (top corner) on every step.

### 2.3 Writes (on Finish — all existing channels)

1. `brand_kits` upsert = `creatorStyleBrandKitPatch(selectedStyle, existingKit)`
   + `name` + `logo_path` (existing preserved when not re-uploaded) + the
   step-2 color overrides applied on top of the patch.
2. `auth.updateUser` `user_metadata`: `creator_type`, `creator_style`
   (dashboard chip), `onboarding_completed_at`, and `logo_overlay` when the
   style carries a logo placement (6C.3 semantics).
3. `ai_preferences` upsert: the type's intent seed (additive; the panel's
   explicit-choice semantics are unchanged — this is the user's explicit
   wizard choice, not profiling).

**Skip** writes only `onboarding_completed_at` (+ nothing else) so the wizard
never re-nags; the dashboard CTA disappears.

### 2.4 Visibility (backward compatible)

- Dashboard: when `!user_metadata.onboarding_completed_at`, the empty state's
  primary CTA becomes **"Set up your studio"** → wizard (new creators), and a
  compact wizard banner shows above the project grid for existing creators
  without the flag. Existing 6A `OnboardingCallout` (workflow strip) unchanged.
- The wizard route is always reachable (re-running it is a harmless guided
  Brand-Kit writer).

## 3. Database impact

**Zero migrations.** `creator_type` + `onboarding_completed_at` ride
`user_metadata` (approved 6C decision §12.3); brand writes hit existing
`brand_kits`; intent hits existing `ai_preferences`.

## 4. Files to touch

| Area | File | Change |
|---|---|---|
| Core | `creator-types.ts` (new) | catalog + `creatorTypeDefaults` |
| Core | `index.ts` | export |
| Core test | `creator-types.test.ts` (new) | catalog integrity, style-id referential check, intent validity, no-real-names guard, resolver |
| Web | `app/[locale]/dashboard/onboarding/page.tsx` (new) | server page: user + kit + logo signed URL |
| Web | `components/onboarding/onboarding-wizard.tsx` (new) | the 4-step client wizard |
| Web | `dashboard/page.tsx` | wizard CTA when flag absent |
| i18n | `messages/{ar,en}.json` | `onboardingWizard.*` (Arabic first) |

**Untouched:** worker, render pipeline, EDL, AI Brain, migrations, existing
Brand Kit form.

## 5. Risks & mitigations

1. **Color override vs style palette confusion** — *Mitigation:* step 3
   explicitly notes "your colors are kept"; the summary shows the final palette.
2. **Partial writes** (kit saved, metadata failed) — *Mitigation:* sequence
   kit → metadata → intent; failures surface a retryable error state; each
   write is idempotent (upserts), so retry is safe.
3. **Existing-kit clobber** — the wizard is also reachable by creators with a
   kit. *Mitigation:* `creatorStyleBrandKitPatch` already preserves identity
   (lower-third text, logo); step 2 prefills from the EXISTING kit when present
   (name/colors), so re-running edits rather than resets.
4. **i18n volume** — *Mitigation:* Arabic-first, one `onboardingWizard.*`
   namespace, parity checked.
5. **RTL/mobile** — *Mitigation:* logical utilities only; grid cards collapse
   to 1-col; verified at 3 widths × 2 locales.

## 6. Verification plan

- Core: `npm test -w @merai/core` (new catalog suite).
- Web: typecheck + `next build` + existing suites.
- E2E (production build + live backend): fresh user → wizard → type pick →
  finish → verify `brand_kits` row matches the style patch, `user_metadata`
  carries `creator_type`/`onboarding_completed_at`, `ai_preferences.intent`
  seeded, dashboard shows the style chip and no wizard CTA.
- RTL + mobile visual pass.

## 7. Backward compatibility

- No flag → CTA shows; flag → nothing changes vs 6C.3.
- Existing creators' kits: wizard preserves identity fields; nothing
  auto-applies without Finish.
- Zero migrations; all writes are additive upserts to existing rows/metadata.
