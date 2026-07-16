# Build 7.6 Report — Timeline v2

Date: 2026-07-17 · Analysis: [BUILD_7_6_ANALYSIS.md](BUILD_7_6_ANALYSIS.md).
Web-only; EDL model/ops and worker untouched.

## 1. What was built

- **Waveform** (`lib/editor/waveform.ts`, pure math + thin browser wrapper):
  `buildPeaks` (max-abs bucketing, remainder-safe), `peaksForRange` (segments
  slice their source window out of ONE full-source envelope — trims/splits/
  reorders never re-decode), `tickIntervalMs`/`rulerTicks` (nice steps
  1/5/10/30/60s by duration band), `decodePeaksFromMedia`
  (`decodeAudioData` → ~1000 buckets; the AudioBuffer is dropped right after;
  null on failure = progressive enhancement).
- **Editor**: decodes the SAME signed URL the player uses, once, in a
  cancellable effect → `peaks` state.
- **Timeline**: time RULER above the strip (LTR, mm:ss labels), per-block
  `WaveformStrip` canvases (content-compared `memo` — playhead ticks never
  redraw a canvas), live trim tooltip (`mm:ss (±Δs)`), widened trim-handle
  touch targets (same `before:` trick as the removed ghosts), taller strip.

**Deviation from the analysis, noted:** the block list was not extracted
into a memoized subcomponent — the stale-closure risk around the editor's
command dispatch outweighed the win once the canvases (the actual per-frame
cost) were content-memoized. Block div reconciliation is trivial.

## 2. Tests (221 → 231)

`waveform.test.ts` (10): bucketing (max-abs, remainder fold, bucket>sample
clamp, empties), range slicing (proportional, full, tiny→1 bucket,
degenerates), tick bands + tick generation. Full suites green: **96 core +
79 worker + 56 web = 231**. Typecheck ✓, `next build` ✓, parity unchanged
(no new keys — the ruler/tooltip are numeric).

## 3. Verification (live backend)

Real recorded take (amplitude-varying audio for visible peaks) → pipeline →
seeded a 3-segment + 1-removal EDL → editor:

| Check | Result |
|---|---|
| Segment blocks | 3 rendered ✓ |
| Ruler | ticks 00:01→00:14 — correct 1s band for the 14.5s output ✓ |
| Waveforms | 3 canvases painted with real decoded peaks (12–21k px each) ✓ |
| Decode failure path | covered by design (null → v1 visuals) |
| Cleanup | user + rows + storage deleted, 0 leftovers |

## 4. Backward compatibility

No waveform (decode unavailable) renders exactly the v1 strip; all editing
interactions (trim/split/reorder/restore) are byte-identical in behavior.

## 5. Production

Deployed with this build's Vercel push (web only).
