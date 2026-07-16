/**
 * Timeline v2 waveform (Build 7.6). The math is pure and unit-tested; only
 * `decodePeaksFromMedia` touches browser audio APIs. Peaks are a bucketed
 * max-abs envelope of the FULL SOURCE — segments slice their own source
 * window out of it, so trims/splits/reorders never re-decode anything.
 */

export const WAVEFORM_BUCKETS = 1000;

/** Max-abs per bucket. Handles non-divisible lengths (remainder samples fold
 *  into the last bucket) and empty input. */
export function buildPeaks(channelData: Float32Array, buckets: number): number[] {
  if (channelData.length === 0 || buckets <= 0) return [];
  const count = Math.min(buckets, channelData.length);
  const perBucket = channelData.length / count;
  const peaks = new Array<number>(count).fill(0);
  for (let i = 0; i < channelData.length; i++) {
    const bucket = Math.min(count - 1, Math.floor(i / perBucket));
    const value = Math.abs(channelData[i]!);
    if (value > peaks[bucket]!) peaks[bucket] = value;
  }
  return peaks;
}

/** Slice the peak range covering [fromMs, toMs] of a totalMs-long source. */
export function peaksForRange(
  peaks: number[],
  totalMs: number,
  fromMs: number,
  toMs: number,
): number[] {
  if (peaks.length === 0 || totalMs <= 0 || toMs <= fromMs) return [];
  const start = Math.max(0, Math.floor((fromMs / totalMs) * peaks.length));
  const end = Math.min(peaks.length, Math.ceil((toMs / totalMs) * peaks.length));
  return peaks.slice(start, Math.max(start + 1, end));
}

/** Nice ruler tick step for a given output duration. */
export function tickIntervalMs(durationMs: number): number {
  if (durationMs <= 15_000) return 1_000;
  if (durationMs <= 60_000) return 5_000;
  if (durationMs <= 3 * 60_000) return 10_000;
  if (durationMs <= 10 * 60_000) return 30_000;
  return 60_000;
}

/** Tick positions (ms) across a duration — excludes 0, includes ≤ duration. */
export function rulerTicks(durationMs: number): number[] {
  if (durationMs <= 0) return [];
  const step = tickIntervalMs(durationMs);
  const ticks: number[] = [];
  for (let ms = step; ms <= durationMs; ms += step) ticks.push(ms);
  return ticks;
}

/**
 * Decode media bytes → bucketed peaks. Browser-only; the AudioBuffer is
 * dropped right after bucketing (only ~WAVEFORM_BUCKETS floats retained).
 * Returns null on any failure — the waveform is a progressive enhancement.
 */
export async function decodePeaksFromMedia(bytes: ArrayBuffer): Promise<number[] | null> {
  try {
    const AudioContextCtor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return null;
    const ctx = new AudioContextCtor();
    try {
      const buffer = await ctx.decodeAudioData(bytes);
      return buildPeaks(buffer.getChannelData(0), WAVEFORM_BUCKETS);
    } finally {
      void ctx.close();
    }
  } catch {
    return null;
  }
}
