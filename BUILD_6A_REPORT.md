# Build 6A Report — Creator Experience Layer

Date: 2026-07-11 · 94 tests green (37 core + 45 worker + 12 web; was 93) ·
`next build` ✓ · ar/en key parity verified (172 = 172)
Analysis that preceded the code: [BUILD_6A_ANALYSIS.md](BUILD_6A_ANALYSIS.md).

## 1. Features implemented

### F1 — AI Reasoning & Confidence Layer
- **`AiDecisionCard`** ([ai-decision-card.tsx](apps/web/src/components/editor/ai-decision-card.tsx)) —
  one shared explanation card used by BOTH cut surfaces (transcript popover +
  timeline ghost popover): localized reason, a plain-language explainer per
  reason category, the cut's real duration, the engine's verbatim note, and a
  one-click restore. User cuts get their own header ("Your edit") so the AI
  isn't blamed for the user's scissors.
- **Confidence hook** ([edl.ts](packages/core/src/edl.ts)) — optional
  `confidence` (0–1) on `removedSegmentSchema`. The card renders it **only
  when present**; engines don't emit it yet, so nothing fake is ever shown.
  Additive-optional: v1 rows, EDL v2 (same sub-schema), and the
  upgrade/downgrade round-trip are unaffected — covered by a new core test.
- Everything displayed is existing EDL/analysis data; zero hardcoded copy —
  all strings in `messages/{ar,en}.json`.

### F2 — Creator-voice processing states
- New `project.working.*` lines under the status stepper:
  رفع "جارٍ رفع الفيديو…" · تفريغ "نُصغي إلى صوتك ونحوّله نصًا…" · تحليل
  "نبحث عن أقوى اللحظات ونجهّز المسودة الأولى…" (en: "Uploading your
  video…" / "Understanding your voice…" / "Finding your strongest moments
  and drafting the first cut…").
- Export stages re-voiced: "Queued — starting in a moment…" and "Preparing
  your final video… {percent}%". Upload copy: "Uploading your video…".
- Status chips keep their short labels (scanability); the working line
  carries the personality. States remain honest — no fake sub-progress.

### F3 — First-time onboarding
- **`OnboardingCallout` + `WorkflowSteps`**
  ([onboarding-callout.tsx](apps/web/src/components/onboarding-callout.tsx)):
  4 numbered steps (Upload → AI analyzes → Review → Export), under 60
  seconds to read, dismissible.
- Per-user, cross-device persistence via `auth.updateUser` user_metadata
  (`onboarding_dismissed_at`) — **no migration, zero extra queries** (the
  user object is already loaded by the dashboard). Dismiss hides instantly;
  a failed offline write just means it reappears next session.
- Responsive: 1 column on mobile → 2 → 4 on desktop; RTL-safe (logical
  utilities only).

### F4 — Keyboard shortcut discovery
- **`ShortcutsHelp`** ([shortcuts-help.tsx](apps/web/src/components/editor/shortcuts-help.tsx)):
  `?` toggles it — **and `؟` too, so the gesture works on Arabic keyboard
  layouts** — plus a header `⌨ ?` button; Esc/backdrop/button close.
- Lists ONLY the six existing shortcuts (Space, Delete, Ctrl+Z,
  Ctrl+Shift+Z, click-to-seek, Shift+click range). No new bindings added.
  Key combos render in a `dir="ltr"` kbd column; labels follow the UI language.

### F5 — Premium empty states
- Dashboard empty state now tells the workflow story: warmer headline
  ("Ready for your first video?"), CTA, and the same `WorkflowSteps` strip —
  the empty state IS the onboarding for brand-new users (the dismissible
  callout appears only once projects exist, so nothing is shown twice).
- Error recovery re-voiced: "Processing hit a snag / Your video is safe.
  Try again now…" — reassurance first, then the action.
- Editor video-error line now tells the user what to do ("refresh the page
  and it'll be right back").

## 2. Files changed
- Core: `edl.ts` (confidence hook) + `edl-v2.test.ts` (round-trip test)
- New: `ai-decision-card.tsx`, `onboarding-callout.tsx`, `shortcuts-help.tsx`
- Modified: `transcript-panel.tsx`, `timeline.tsx`, `editor-view.tsx`,
  `project-status-view.tsx`, `dashboard/page.tsx`
- i18n: `messages/ar.json`, `messages/en.json` (Arabic written first;
  parity script-verified: 172 keys each, zero drift)
- Untouched: worker, migrations, export planner, EDL ops, auth, upload logic

## 3. Technical decisions
1. **One decision card, two surfaces** — the transcript popover and timeline
   ghost popover render the same component, so the AI explains itself
   identically everywhere (and future surfaces get it for free).
2. **No fake confidence** — the schema hook ships, the UI conditionally
   renders, engines emit later. An invented score would poison the trust
   this build exists to create.
3. **user_metadata over a profiles column** — right-sized persistence for a
   UX flag: per-user, cross-device, no migration, no RLS surface change.
4. **`؟` alongside `?`** — Shift on Arabic layouts produces the Arabic
   question mark; listening for both keeps the discovery gesture universal.
5. **Chips stay factual, prose carries warmth** — creator voice lives in the
   working line/explainers, while statuses remain short and scannable.

## 4. UX improvements (summary)
Trust: every cut now explains itself in plain language with real numbers.
Clarity: each pipeline stage says what Merai is doing for the creator.
Onboarding: a 20-second read replaces a blank dashboard.
Discoverability: shortcuts are one keypress away in both scripts.
Tone: system-flavored errors became reassuring recovery paths.

## 5. Deferred items
- Confidence *generation* (Haiku/heuristic engines emitting
  `RemovedSegment.confidence`) — Build 6B; the hook and UI are ready.
- Regenerate-with-aggressiveness ("cut more / cut less") — AI Editing Brain
  build.
- Per-step numeric progress (transcription %) — needs provider streaming.
- Word-level transcription-confidence coloring in the transcript.
- Upload pre-flight metadata display (duration/size before upload).

## 6. Known limitations
- Browser feel-pass not run this session (Chrome extension unavailable, as
  in Build 5): RTL correctness rests on logical-utilities discipline plus
  `next build`/tests; a manual click-through of the popovers, dialog, and
  callout in both locales is the first item for the next live session.
- The onboarding callout renders server-side from user_metadata, so a user
  who dismisses on device A may see it flash on device B if that page was
  server-rendered before the metadata write propagated — cosmetic, one-time.
- `working.uploading` is rarely visible (the upload page owns that phase;
  the project page usually starts at transcribing) — kept for completeness.
