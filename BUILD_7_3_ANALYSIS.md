# Build 7.3 Analysis — Teleprompter, Speaker Notes, Countdown Controls

Date: 2026-07-16 · Analysis before code. Parent decomposition:
[BUILD_7_1_ANALYSIS.md](BUILD_7_1_ANALYSIS.md) (scenes + worker stitch moved
to 7.4 — this build stays web-only).

## 1. Design

### 1.1 Prompter modes
- **Teleprompter**: the script scrolls over the preview while recording —
  speed is creator-controlled; scrolling pauses with the take (the 7.1
  pause-excluding elapsed drives the offset, so a paused take never drifts).
- **Speaker notes**: the same text as a static, readable panel (no scroll).
- **Off** (default — nothing changes for 7.1/7.2 users).

### 1.2 Core (`lib/record/teleprompter.ts`, pure + tested)
- `scrollOffsetPx(elapsedMs, pxPerSec)` — offset is a pure function of the
  session's elapsed time (already pause-excluding), NOT wall clock.
- `estimateReadingSeconds(text, wpm=140)` — whitespace word count (works for
  Arabic and Latin), shown as a "~mm:ss read" hint next to the cap.
- Clamps: speed 10–120 px/s (default 40), font 18–48 px (default 28),
  countdown ∈ {3, 5, 10} seconds.
- Prefs ride the existing `merai.record.prefs` (mode/PiP already there);
  the script text itself drafts to its own localStorage key (device-level,
  like everything recorder-side so far).

### 1.3 UI (`components/record/teleprompter.tsx` + RecordFlow wiring)
- Setup: prompter mode toggle (off / notes / prompter), script textarea with
  reading-time estimate, speed + font sliders (prompter only), countdown
  picker (3/5/10) beside the record button.
- Recording: prompter renders as a top overlay band on the preview (RTL text,
  translucent backdrop, `translateY` from `scrollOffsetPx`, 250ms linear
  transition riding the elapsed ticks); notes render as a static band.
- The overlay never captures into the recording — it is DOM ABOVE the
  preview video; the recorded stream comes from the camera/composite
  MediaStream, which the DOM can't touch. (Structural, no test needed.)

## 2. Files

| File | Change |
|---|---|
| `lib/record/teleprompter.ts` (new) | pure helpers + clamps |
| `components/record/teleprompter.tsx` (new) | overlay (prompter/notes) |
| `components/record/record-flow.tsx` | script editor, mode toggle, countdown pref, overlay mount |
| `test/teleprompter.test.ts` (new) | offset math, reading estimate, clamps |
| `messages/{ar,en}.json` | `record.prompter.*`, countdown labels (ar first) |

## 3. DB/worker impact
None. Zero migrations.

## 4. Risks
1. **Overlay legibility over video** — translucent dark backdrop + text
   shadow; font size creator-controlled.
2. **Scroll drift vs pause** — offset derives from session elapsed
   (pause-excluding), tested in 7.1; prompter inherits it.
3. **Long scripts** — textarea capped at 20k chars; overlay scrolls only.

## 5. Verification
Unit (offset/estimate/clamps) · suites/typecheck/build/parity · live E2E:
script → prompter overlay visible and scrolling during a synthetic-device
recording, frozen while paused, notes mode static; countdown pref honored.
