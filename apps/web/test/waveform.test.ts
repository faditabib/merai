import { describe, expect, it } from "vitest";
import {
  buildPeaks,
  peaksForRange,
  rulerTicks,
  tickIntervalMs,
} from "../src/lib/editor/waveform";

describe("buildPeaks (Build 7.6)", () => {
  it("takes the max-abs per bucket (float32-exact values)", () => {
    const data = new Float32Array([0.125, -0.75, 0.25, 0.5, -0.125, 0.625]);
    expect(buildPeaks(data, 3)).toEqual([0.75, 0.5, 0.625]);
  });

  it("folds remainder samples into the last bucket", () => {
    const data = new Float32Array([0.125, 0.25, 0.25, 0.375, 0.875]);
    const peaks = buildPeaks(data, 2);
    expect(peaks).toHaveLength(2);
    expect(peaks[1]).toBe(0.875);
  });

  it("never returns more buckets than samples", () => {
    expect(buildPeaks(new Float32Array([0.5, 0.7]), 10)).toHaveLength(2);
  });

  it("handles empty input and zero buckets", () => {
    expect(buildPeaks(new Float32Array(0), 10)).toEqual([]);
    expect(buildPeaks(new Float32Array([0.5]), 0)).toEqual([]);
  });
});

describe("peaksForRange", () => {
  const peaks = Array.from({ length: 10 }, (_, i) => i / 10); // 0..0.9

  it("slices the proportional window", () => {
    // 10s source: [2s, 5s) → buckets 2..4
    expect(peaksForRange(peaks, 10_000, 2_000, 5_000)).toEqual([0.2, 0.3, 0.4]);
  });

  it("full range returns everything", () => {
    expect(peaksForRange(peaks, 10_000, 0, 10_000)).toEqual(peaks);
  });

  it("tiny ranges still return at least one bucket", () => {
    expect(peaksForRange(peaks, 10_000, 3_000, 3_001)).toHaveLength(1);
  });

  it("degenerate inputs return empty", () => {
    expect(peaksForRange([], 10_000, 0, 1_000)).toEqual([]);
    expect(peaksForRange(peaks, 0, 0, 1_000)).toEqual([]);
    expect(peaksForRange(peaks, 10_000, 5_000, 5_000)).toEqual([]);
  });
});

describe("ruler ticks", () => {
  it("chooses nice steps per duration band", () => {
    expect(tickIntervalMs(10_000)).toBe(1_000);
    expect(tickIntervalMs(45_000)).toBe(5_000);
    expect(tickIntervalMs(2 * 60_000)).toBe(10_000);
    expect(tickIntervalMs(8 * 60_000)).toBe(30_000);
    expect(tickIntervalMs(20 * 60_000)).toBe(60_000);
  });

  it("generates ticks excluding zero, bounded by the duration", () => {
    expect(rulerTicks(12_000)).toEqual([
      1_000, 2_000, 3_000, 4_000, 5_000, 6_000, 7_000, 8_000, 9_000, 10_000, 11_000, 12_000,
    ]);
    expect(rulerTicks(0)).toEqual([]);
  });
});
