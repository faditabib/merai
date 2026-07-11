# Build 6A Analysis — Creator Experience Layer

Date: 2026-07-11 · Written before any code (per build instructions).
Scope: trust, clarity, onboarding, AI transparency, polish. No new editing
features, no billing/collab/templates/music (explicitly out).

## 1. Current UX problems (verified in source)

| # | Problem | Where |
|---|---------|-------|
| P1 | AI cuts show a category label + raw note, but no duration, no confidence, and no plain-language explanation of what triggered the cut | [transcript-panel.tsx](apps/web/src/components/editor/transcript-panel.tsx) popover, [timeline.tsx](apps/web/src/components/editor/timeline.tsx) `RemovedGhost` |
| P2 | No cut-confidence data exists anywhere in the model — `RemovedSegment` is `{id, times, wordIds?, reason, note?}`. Word-level *transcription* confidence exists (`TranscriptWord.confidence`) but is never surfaced | [edl.ts](packages/core/src/edl.ts), [transcript.ts](packages/core/src/transcript.ts) |
| P3 | Processing states are status labels, not experiences: chips say "Transcription/Analysis", the only prose is one generic "processing is in progress" line | [project-status-view.tsx](apps/web/src/components/project-status-view.tsx), `project.steps.*` in messages |
| P4 | Zero onboarding: after signup the user lands on an empty dashboard whose only guidance is "Upload your first raw video…" | [dashboard/page.tsx](apps/web/src/app/[locale]/dashboard/page.tsx) |
| P5 | Six keyboard shortcuts exist (Space, Delete/Backspace, Ctrl+Z, Ctrl+Shift+Z, click-to-seek, Shift+click range) but are discoverable only from one hint paragraph | [editor-view.tsx](apps/web/src/components/editor/editor-view.tsx) keydown handler |
| P6 | Empty/waiting/error states are functional but system-flavored ("Something went wrong during processing") and the dashboard empty state doesn't teach the workflow | dashboard, project error panel, editor video states |
| P7 | Export "rendering" copy is server-mechanical ("Rendering on the server… 40%") | export-panel strings |

## 2. Existing reusable assets

- **i18n discipline is total** — every string already flows through
  `messages/{ar,en}.json`; new UX copy is purely additive keys (Arabic first).
- **The transparency popover pattern** (reason + note + restore) exists in
  BOTH the transcript panel and timeline ghosts — enriching one shared shape
  upgrades both.
- **Status stepper + polling** already distinguishes active vs. reached vs.
  pending steps — the creator-voice "working line" hooks under it cleanly.
- **`user_metadata`** via `supabase.auth.updateUser()` provides per-user,
  cross-device storage with no migration and no new RLS surface — right-sized
  for an onboarding-dismissed flag (house rule: no schema churn for UX flags).
- **Real data available today for honest AI transparency**: cut duration
  (`sourceOutMs - sourceInMs`), reason category, Haiku's verbatim note, and
  word-level transcription confidence.

## 3. Files to modify

| Area | Files |
|------|-------|
| Core (hook only) | `packages/core/src/edl.ts` — additive optional `confidence` on `removedSegmentSchema` (+ test) |
| AI reasoning UI | `transcript-panel.tsx`, `timeline.tsx` |
| Processing states | `project-status-view.tsx`, `export-panel.tsx` (strings), `upload-flow.tsx` (strings) |
| Onboarding | `dashboard/page.tsx` + new `components/onboarding-callout.tsx` |
| Shortcuts | `editor-view.tsx` + new `components/editor/shortcuts-help.tsx` |
| Empty states | `dashboard/page.tsx`, `project-status-view.tsx` error panel |
| i18n | `messages/ar.json`, `messages/en.json` (all of the above) |

Not touched: worker, migrations, export planner, EDL ops, auth, upload
pipeline logic.

## 4. Implementation plan

**F1 — AI reasoning & confidence layer.**
Add `confidence: z.number().min(0).max(1).optional()` to
`removedSegmentSchema` — the architecture hook. It is additive-optional, so
v1 rows, v2 rows (which reuse the schema), and the round-trip law are all
unaffected; engines start emitting it in a later build. The popovers (both
surfaces) become a small "AI decision card": localized reason title, a
plain-language explainer per reason category (i18n, not hardcoded), the cut's
real duration, Haiku's note when present, and — only when the field exists —
the confidence as a percentage. **No fake scores: absent data renders
nothing.**

**F2 — Creator-voice processing states.**
New `project.working.{uploading,transcribing,analyzing,drafting}` strings
("Understanding your voice…", "Finding the strongest moments…", …) shown as
the active step's line under the stepper; export rendering copy becomes
"Preparing your final video… {percent}%"; upload copy becomes "Uploading your
video…". Chips keep their short labels (scanability), the working line
carries the personality.

**F3 — Onboarding callout.**
`OnboardingCallout` (client): 4 numbered steps (Upload → AI analyzes → Review
→ Export), dismissible ✕. Server reads `user.user_metadata.onboarding_dismissed_at`
(zero extra queries — the user object is already loaded) and skips rendering
for returning users; dismiss writes `auth.updateUser` + hides instantly.
Responsive: 1-column on mobile, 4 across on desktop; RTL-safe via logical
utilities only.

**F4 — Shortcuts help.**
`?` keydown (outside inputs) and a header "⌨" button toggle a dialog listing
ONLY the six existing shortcuts; Esc/backdrop closes. No new shortcuts.

**F5 — Premium empty states.**
Dashboard empty state absorbs the 4-step journey (one component, two uses);
error panel copy moves to reassuring recovery language ("Your video is safe —
processing hit a snag. Try again…"); editor video-loading/error strings warmed
up. All ar+en.

Order: core hook + tests → i18n keys (ar first) → F1 → F2 → F5 → F3 → F4 →
full verification (suites, `next build`, RTL check via string/dir review).

## 5. Risks

1. **`removedSegmentSchema` change ripples into v2 + adapters** — mitigated:
   optional field, round-trip tests already cover `removed` passthrough; add
   an explicit test asserting a confident removal survives upgrade/downgrade.
2. **ar/en key drift** — next-intl throws on missing keys at render. Both
   files are edited in the same change; a key-parity check happens before
   commit (jq key diff).
3. **`?` on Arabic keyboard layouts** (Shift+ظ produces ؟) — listen for both
   `?` and `؟` so the discovery gesture works on Arabic layouts.
4. **user_metadata write failures** (offline) — dismiss also sets local state
   immediately; worst case the callout reappears next session (annoyance, not
   breakage).
5. **Scope creep pressure** — confidence *generation* (engine changes),
   regenerate-with-aggressiveness, usage meters are all Build 6B+; this build
   only exposes what already exists plus the schema hook.
