# Merai — UX Audit & Transformation Sprint (2026-07-17)

Method: every flow below was exercised live during Builds 6C.4–9 and the
hardening sprint (fresh users, synthetic devices, real pipeline). Benchmark:
Stripe / Linear / Vercel-class SaaS. No new features — experience only.

## Current UX score: 7.2 / 10
Strong: golden paths, AI transparency, identity system coherence, RTL/i18n
discipline. Holding it back: permission UX, dead-end error states, ad-hoc
navigation, missing pre-action guidance.

## 1. First-user experience — 7/10
Landing → signup → dashboard is clean; wizard CTA is prominent; empty state
teaches the workflow. **Issues**: (U1) recorder requests camera/mic ON PAGE
LOAD with zero explanation — the scariest browser prompt appears before any
context (P0); (U2) after wizard skip there is no visible way back to setup;
(U3) "time to first value" is good (wizard → record → auto pipeline) but
nothing on the dashboard says the pipeline runs unattended ("you can close
the tab") — stated only inside upload.

## 2. Navigation & IA — 6/10
(U4) No consistent page header: record/billing/brand-kit each hand-roll a
"← لوحة التحكم" link; project/editor pages orient differently (P1 — shared
breadcrumb header). (U5) AppHeader has no link to the recorder (core
product!) and no active-page indication (P1). (U6) No breadcrumb on editor
(deepest page: dashboard → project → editor).

## 3. Recording studio — 7/10 (core product, highest stakes)
Countdown/pause/cap/takes are genuinely premium. **Issues**: (U1 again)
permission ambush; (U7) device errors say what failed but the
permission-denied path deserves browser-settings guidance steps; (U8) after
a failed handoff upload (quota/network) the creator is STRANDED — no way
back to takes without losing them (P0); (U9) quota error doesn't link to
billing (P0-adjacent); (U10) prompter invisible during countdown — speakers
need the first line ready; (U11) takes lost on refresh (known, major
initiative — out of scope); (U12) no audio level meter (medium, deferred).

## 4. Dashboard — 8/10
Premium bones: hero, quick actions, nudges, thumbnails, organization.
(U13) No loading skeletons (server latency acceptable today — medium);
(U14) status chips rely on color+text (acceptable; icon shape = polish).

## 5. Editor / studio — 7/10
Timeline v2 + AI panel + export are coherent. (U15) Auto-Canvas aspect sync
pollutes the undo stack (undo suddenly "does nothing" — trust issue, P1);
(U16) Skills row vs legacy presets row = two overlapping concepts (P1-lite:
frame with a title, merge later); (U17) processing states during
AI/suggestion polling are clear; export progress clear. (U18) No editor
breadcrumb (see U6).

## 6. Design system consistency — 8/10
One language (rounded-2xl cards, accent chips, logical CSS). (U19) Focus
states are browser-default on custom controls — keyboard users get an
inconsistent ring (P1 — one global focus-visible style); (U20) two upload
progress visual treatments (single vs scenes — cosmetic, skip).

## 7. Error handling — 6.5/10
All errors translated; recovery is the gap: (U8) recorder dead-end (P0);
(U21) upload dropzone errors offer no "try again" affordance beyond
re-dropping (acceptable); (U22) stitch/transcribe failures surface with
retry on the project page (fixed in hardening ✓); (U23) quota errors
explain but don't link (P0-adjacent).

## 8. Mobile — 7/10
All 6C+ surfaces responsive (spot-checked 375px live). Editor is the weak
screen (tall stack; wide trim targets already shipped). Major initiative,
out of this sprint's scope.

## 9. Premium feel vs benchmarks
Missing Stripe/Linear-isms: consistent page chrome (U4/U5), focus polish
(U19), permission choreography (U1), recovery empathy (U8). All addressed
this sprint. Micro-interactions (hover lift, transitions) already present.

## Top issues ranked (50 collapsed to the 24 that matter)
P0: U1, U8, U9/U23 · P1: U4, U5, U10, U15, U19, U16(lite), U2(lite) ·
Medium: U3, U7(deep guidance), U12, U13, U14, U20 · Major: U6+U18 (editor
IA), U11 (IndexedDB takes), mobile editor, timeline zoom.

## Implemented this sprint (P0+P1 only)
1. **Recorder permission choreography** (U1/U7): a pre-permission intro
   state explaining WHY camera+mic are needed; devices open on an explicit
   gesture; permission-denied error now carries step-by-step browser
   guidance. No auto-ambush on load.
2. **Recorder error recovery** (U8): failed handoff shows "العودة إلى
   اللقطات" — takes preserved, camera re-opens, nothing lost.
3. **Quota → billing deep link** (U9/U23) in upload + scenes error panels.
4. **Shared `PageHeader` breadcrumb** (U4) on record/billing/brand-kit/
   onboarding — consistent "where am I / how do I get back".
5. **AppHeader**: recorder link + active-page states (U5).
6. **Prompter visible during countdown** (U10).
7. **Auto-Canvas aspect sync no longer pollutes undo** (U15).
8. **Global focus-visible ring** (U19) + Skills row title framing (U16).
9. **Wizard re-entry**: "إعادة إعداد الاستوديو" quick link on the dashboard
   when onboarding is complete (U2).

Everything else stays in the ranked backlog for the next approved cycle.
