# Merai — Design Transformation Plan (2026-07-18)

Reference: the provided premium-SaaS mock (RTL sidebar shell, violet accent,
IBM Arabic Sans, calm whitespace). **Functionality is the source of truth** —
this phase changes pixels, never flows, routes, actions, or data.

## 1. Current UI problems (audit of the implementation)

1. **No app shell** — a single top header; no persistent sidebar, so
   navigation feels like a website, not a workspace (the reference's core
   idea is the RTL sidebar + topbar shell).
2. **Tokens drift from the direction** — background `#fafafa` and accent
   `#7c3aed` vs the reference's calmer `#F7F8FA` surface / `#6B46C1` violet;
   UI font is Tajawal while the reference (and our own caption renderer)
   uses IBM Arabic Sans — two families on screen.
3. **Cards are heavy** — `rounded-2xl` + strong borders everywhere; the
   reference uses lighter radii, hairline borders, and shadow-on-hover.
4. **Quick actions are text pills** — the reference gives each action an
   icon + title + one-line description card.
5. **Plan/usage is buried** — the reference surfaces the tier + upgrade in
   the sidebar footer (we have REAL tier data; the widget must use it).

## 2. Design system (tokens — one place, `globals.css`)

| Token | Value (light) | Note |
|---|---|---|
| background | `#F7F8FA` | reference surface |
| card | `#FFFFFF` | + `shadow-sm` on hover only |
| border | `#E5E7EB` | hairline |
| foreground | `#111827` | reference ink |
| accent | `#6B46C1` (dark mode `#8B6CD9`) | reference violet |
| success | `#10B981` | status chips (existing emerald ok) |
| font | **IBM Plex Sans Arabic** (`--font-plex-arabic`, already loaded) | reunifies UI + caption family |

Dark mode keeps the existing scheme with re-tuned accent. Radii: cards stay
as-built (a global radius migration would touch 40+ files for decoration —
deferred; new shell uses the lighter language).

## 3. Component mapping (all REAL, nothing mocked)

| Reference element | Existing implementation | Action |
|---|---|---|
| RTL sidebar (logo, nav, active states) | `AppHeader` + `NavLinks` | `AppHeader` becomes the SHELL: fixed inline-end sidebar (lg+) + topbar; `NavLinks` gains icons + a `side` variant. Zero page edits (CSS sibling rule pads `main`). |
| Sidebar plan widget | real `profiles.subscription_tier` | tier chip + «ترقية الخطة» → `/dashboard/billing` (real data, no fake %) |
| Topbar greeting + avatar | dashboard greeting (real user) | moves into the topbar (initial-letter avatar) |
| Search (⌘K) | REAL search exists in ProjectsExplorer | stays where the data is — no fake global search |
| Quick-action icon cards | `QuickActions` (real routes) | icon + title + description card style |
| Project thumbnail cards | `ProjectCard` (real thumbs/status/menu) | already matches; inherits tokens |
| Projects table / editor / billing screens | all real | inherit tokens now; deeper P2/P3 passes in later cycles |

## 4. Screens updated this pass (Priority 1)

Shell (all authenticated pages at once) · tokens (every screen) · dashboard
quick actions. P2 (studio/editor chrome) and P3 (billing/settings layouts)
inherit the tokens immediately and get dedicated passes in the next cycle —
gradual, as instructed.

## 5. Implementation approach & safety

CSS-first: tokens + one shell component swap; no route, action, prop, or
data change anywhere. Verification: full suites + build + live browser pass
(nav, active states, greeting, tier widget all real).
