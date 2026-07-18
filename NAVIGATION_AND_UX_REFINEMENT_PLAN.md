# Navigation & UX Refinement Plan (2026-07-18, owner walkthrough feedback)

## Problems from the walkthrough → changes

1. **Logout/language pollute product nav** → new **UserMenu dropdown** in the
   topbar (avatar → Account/Settings, Subscription, Language, Theme, Logout).
   Sidebar becomes product-only: Dashboard · Record · Creator Studio.
   Billing moves under the user menu (and stays in the sidebar plan widget's
   upgrade link).
2. **No account destination** → new `/dashboard/settings` page: account info
   (real email), profile (real `display_name` edit via `auth.updateUser`),
   preferences (language links, theme), subscription link. Correct IA, not
   overbuilt.
3. **RTL/LTR sidebar side** → switch the shell from `end` to **`start`**
   logical positioning: Arabic keeps the right sidebar, English gets the
   conventional left sidebar — one change fixes both, topbar/main offsets
   follow via logical margins.
4. **Dashboard experience** → outcome-focused welcome copy ("فيديوهات
   احترافية بمونتاج ذكاء اصطناعي — بدون خبرة مونتاج"); WorkflowSteps get a
   guided-journey connector treatment; **quick actions regroup 4 → 3**:
   New video · Record · **Creator Studio** (Brand Kit + Caption styles +
   identity are one creative home — they already share a route).
5. **Styles feel like DB rows** → CreatorStyles cards get premium-template
   treatment: larger preview emphasis, hover lift, cleaner footer hierarchy.
6. **Notification foundation** → topbar bell + dropdown fed by REAL recent
   events (latest ready projects + completed exports from the DB); honest
   empty state. No fake items.
7. **Honesty items** — camera permission explain→request→recover flow and
   the 50MB honest limits are ALREADY shipped (UX sprint / readiness
   sprint); re-verified here, kept visible.
8. **Theme switch** → real minimal implementation: `data-theme` overrides
   mirroring the existing dark palette + a no-FOUC boot script; stored in
   localStorage; system default.

## Components affected
`app-header.tsx` (shell: side switch, UserMenu, bell) · new `user-menu.tsx`,
`notifications-menu.tsx` · new `settings/page.tsx` + `settings-form.tsx` ·
`nav-links.tsx` (product-only + settings-aware) · `quick-actions.tsx` (3
groups) · `onboarding-callout.tsx` (journey connectors) ·
`creator-styles.tsx` (card polish) · `globals.css` (theme + side offsets) ·
i18n (ar first).

Verification: parity · typecheck · suites · build · live AR/RTL + EN/LTR
shell check · settings save round-trip · no route changes除 the new
/dashboard/settings.
