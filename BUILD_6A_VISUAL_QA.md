# Build 6A — Visual QA Report

Date: 2026-07-11 · Method: manual review of 19 screenshots captured by
headless Chrome (Playwright) against the production build (`next start`,
live Supabase data, real project with AI cuts) — desktop 1440×900 and
mobile 390×844, Arabic and English. Two functional probes (؟ key, dismiss
persistence) ran scripted. No code was modified.

## Verified working ✅

- **Arabic RTL layout**: landing, dashboard, project page, editor all read
  right→left correctly; stepper flows RTL with the first step at the right;
  the timeline strip stays pinned LTR by design; dismiss button sits at the
  logical end. No horizontal scroll on any mobile surface.
- **English layout**: full mirror is correct; Arabic transcript content
  stays RTL inside the LTR UI (content language ≠ UI language) as intended.
- **Onboarding**: 4-across on desktop, 1-column on mobile, correct in both
  locales; **dismiss persists across reload** (scripted check: not visible
  after dismiss + reload) and the empty state carries the workflow story.
- **AI decision card (timeline ghosts)**: full card renders — reason,
  Arabic explainer, real duration chip ("0.5 ث محذوفة"), Haiku's verbatim
  note, restore button.
- **Processing states**: captured LIVE during a fresh upload —
  "نُصغي إلى صوتك ونحوّله نصًا…" under the pulsing التفريغ النصي chip with
  the reassurance line. (This run doubled as a pipeline regression check:
  upload → transcribe → analyze → ready all healthy on the Railway worker
  after Builds 5/6A.)
- **Shortcuts dialog**: clean in both locales; kbd column correctly pinned
  LTR inside the RTL dialog; `?` opens it; Esc closes; only the six real
  shortcuts listed.
- **Caption overlay**: connected, correctly shaped Arabic burned over the
  video preview.

## Bugs 🐞

1. **[HIGH] Transcript AI decision card is clipped** (both locales).
   The popover is absolutely positioned inside the transcript `article`,
   which has `max-h + overflow-y-auto` — the card is cut at the container
   edge: the duration chip, note, and **the restore button are unreachable**
   from the transcript surface (the timeline ghost card is unaffected, so
   restore remains possible — but the transcript is the primary surface).
   Fix direction: render the popover in a portal / position it outside the
   scroll container / flip above when clipped.
2. **[LOW] `؟` (Arabic question mark) did not open the shortcuts dialog**
   in the scripted probe (`keyboard.type("؟")` → no dialog), while `?`
   works. May be a Playwright key-event artifact — worth one manual try on
   a real Arabic layout; if it reproduces, the handler needs to catch the
   character at `keypress`/`beforeinput` level or match `event.code`.
3. **[LOW] Popover can also clip horizontally**: the 16rem card anchored
   `start-0` on a word near the container's inline-end overflows the
   rounded border (visible as a flush edge in the AR shots). Same fix as #1.

## Inconsistencies ⚠️

4. **Haiku's note is English inside the Arabic UI** — the card's title,
   reason, and explainer are Arabic, then the verbatim engine note switches
   language ("as hesitation/discourse marker…"). Known Phase-3 decision
   (note shown as-is), but now that the note sits inside a polished Arabic
   card it visibly breaks the voice. Fix belongs at the analysis prompt
   (ask Haiku to write notes in the video's language) — Build 6B candidate.
5. **Greeting shows the raw email** ("أهلًا، smoke-e2e@merai.test") — falls
   back to email when display_name is empty; reads developer-ish on the
   otherwise warm dashboard. Use the mailbox part (before @) or drop the
   name when absent.
6. **Mixed numeral styles in the Arabic UI**: onboarding body uses
   Arabic-Indic (١٠ دقائق) while step circles (1–4), dates (9:11), counts
   (23 كلمة), and durations (0.5 ث) use Latin digits. Pick one policy
   (suggest: Arabic-Indic via locale-aware formatting everywhere in ar).
7. **"حذف المحدد (0)"** — the disabled delete button shows a zero count;
   hiding the count (or the parenthetical) when nothing is selected is
   cleaner in both locales.
8. **Editor header wraps to two rows on mobile** and the caption preset
   row orphans "تمييز كلمة بكلمة" onto its own line — functional, slightly
   untidy.

## Polish opportunities ✨

9. **Timeline ghost hit area** is a 2px-wide strip (w-2) — precise on
   desktop, genuinely hard to tap on mobile. Add an invisible larger hit
   area (or a tap-friendly popover trigger) without changing the visual.
10. **Landing page still has no product visual** (echoing
    PRODUCT_UI_AUDIT.md): the AI decision card itself would make a great
    hero screenshot — the trust feature is now the most demo-able asset.
11. **Project page on desktop is whitespace-heavy** below the fold once
    ready; the transcript card could sit beside the summary chips at
    ≥lg widths.
12. **Shortcuts dialog a11y**: no focus trap / initial focus observed in
    markup review; Esc and backdrop work. Worth wiring focus management
    when a second dialog appears in the product.
13. **Save button distance on mobile**: primary action sits at the end of
    a wrapped header row; a sticky footer save on mobile would keep it
    reachable. (Defer until the mobile editing story matters.)

## Coverage notes

- The **analyzing** working line ("نبحث عن أقوى اللحظات…") was NOT captured
  visually — the analysis step completed in ~4s, faster than the poll. The
  string is key-parity-verified and uses the identical render path as the
  captured transcribing line, so risk is minimal.
- The **error state** (re-voiced recovery copy) and **English mobile**
  variants were not screenshotted (no induced failure; ar-mobile + en-desktop
  cover the grid's risk). Both are string-level changes on verified layouts.
- The upload page's in-flight states (pause/resume) were out of scope; only
  its strings changed in 6A.

## Suggested fix order (when implementation resumes)

1. Bug #1/#3 — popover clipping (the trust feature must be fully usable
   from the transcript).
2. Bug #2 — confirm and fix ؟ on a real Arabic layout.
3. #5 + #7 — greeting fallback and zero-count label (minutes each).
4. #6 — numeral policy for the Arabic locale.
5. #4 — note language via analysis prompt (needs a live Haiku run to verify).
6. #9 — ghost hit area (pairs with any future mobile pass).
