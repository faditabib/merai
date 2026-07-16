# Build 7.6 Analysis — Timeline v2

Date: 2026-07-17 · Analysis before code. Web-only; EDL model, ops, and worker
untouched (the timeline stays a VIEW over `EdlV1` — v1's editing semantics
are production-proven).

## 1. What v2 adds over the 6A timeline

| Area | v1 today | v2 |
|---|---|---|
| Waveform | none — blocks are flat color | real audio peaks behind every kept block (client-side decode, cached) |
| Timestamps | block tooltip only | a time RULER with nice ticks (1/5/10/30/60s by duration) + mm:ss labels |
| Trim UX | silent drag, commit ≥10ms | live tooltip while dragging: current time + Δ; wider touch hit areas |
| Performance | whole strip re-renders every rAF tick (playhead) | blocks memoized (`React.memo`); per-frame work = playhead + active highlight only |
| Ergonomics | h-20 strip | taller strip (waveform), same proportional responsive layout |

## 2. Design

### 2.1 Waveform (pure math + thin browser wrapper)
`lib/editor/waveform.ts`:
- `buildPeaks(channelData, buckets)` — max-abs per bucket (pure, tested).
- `peaksForRange(peaks, totalMs, fromMs, toMs)` — slice a segment's source
  window out of the full-source peak array (pure, tested).
- `tickIntervalMs(durationMs)` — nice ruler steps (pure, tested).
- `decodePeaksFromMedia(bytes)` — `AudioContext.decodeAudioData` wrapper
  (browser-only, ~1000 buckets). EditorView fetches the SAME signed URL the
  player uses, decodes once in a cancellable effect, caches in state; decode
  failure = no waveform (progressive enhancement, never an error).
- Rendering: a tiny `WaveformStrip` canvas per block (slice → bars). Removed
  ghosts stay thin red strips (no waveform — they're 2px).

### 2.2 Ruler & trim tooltip
- Ruler row above the strip (LTR like the strip): ticks at `tickIntervalMs`,
  labels via the existing `formatElapsed` (mm:ss).
- Trim drag renders a floating chip near the handle: `mm:ss.d (±Δs)`.

### 2.3 Performance
- `TimelineBlocks` memoized subcomponent — props exclude `sourceMs`; the
  playhead and active-block highlight are the only per-frame consumers
  (active id passed as a string, memo-friendly).

## 3. Files

| File | Change |
|---|---|
| `lib/editor/waveform.ts` (new) | pure peak/tick math + decode wrapper |
| `test/waveform.test.ts` (new) | bucketing, slicing, ticks — edges included |
| `components/editor/timeline.tsx` | ruler, waveform strips, trim tooltip, memoized blocks |
| `components/editor/editor-view.tsx` | decode-once effect; pass peaks |

## 4. DB/worker impact
None. Zero migrations.

## 5. Risks
1. **Decode cost on 10-min sources** — one-time, off the render path, and
   cancellable; failure degrades to v1 visuals.
2. **Memory** — only the bucketed peaks (~1000 floats) are retained; the
   decoded AudioBuffer is released after bucketing.
3. **Memoization staleness** — block props are all primitives/refs that
   change when the EDL changes; the memo key set is the EDL identity.

## 6. Verification
Unit (peaks/slice/ticks) · suites/typecheck/build/parity · live: editor on a
real recorded project shows ruler + waveforms; trim shows the live chip;
Performance sanity: React profiler not available headless — assert via
memoized component identity (blocks don't re-render on playhead ticks) with
a render counter in dev, removed before ship.
