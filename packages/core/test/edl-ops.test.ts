import { describe, expect, it } from "vitest";
import {
  edlOutputDurationMs,
  nextSegmentAfterSource,
  outputToSourceMs,
  removeWords,
  reorderSegment,
  restoreRemoved,
  rippleDeleteSegment,
  segmentAtSource,
  sourceToOutputMs,
  splitSegmentAt,
  trimSegment,
  type EdlV1,
  type TranscriptWord,
} from "../src/index";

function word(id: string, startMs: number, endMs: number): TranscriptWord {
  return { id, text: id, startMs, endMs, confidence: 0.95 };
}

// Three words per segment, 2 segments, a removed gap between them.
const words: TranscriptWord[] = [
  word("w0", 100, 400),
  word("w1", 450, 800),
  word("w2", 850, 1200),
  word("w3", 3000, 3300),
  word("w4", 3350, 3700),
  word("w5", 3750, 4100),
];

const baseEdl: EdlV1 = {
  version: 1,
  projectId: "11111111-1111-4111-8111-111111111111",
  sourceUploadId: "22222222-2222-4222-8222-222222222222",
  timeline: [
    { id: "seg-k0", sourceInMs: 0, sourceOutMs: 1300, wordIds: ["w0", "w1", "w2"] },
    { id: "seg-k1", sourceInMs: 2900, sourceOutMs: 4200, wordIds: ["w3", "w4", "w5"] },
  ],
  removed: [
    { id: "seg-r0", sourceInMs: 1300, sourceOutMs: 2900, reason: "silence" },
  ],
  aspectRatio: "9:16",
  captionStyle: "minimal-white-bottom",
};

describe("time mapping", () => {
  it("maps source↔output across the removed gap", () => {
    expect(sourceToOutputMs(baseEdl, 0)).toBe(0);
    expect(sourceToOutputMs(baseEdl, 1000)).toBe(1000);
    expect(sourceToOutputMs(baseEdl, 2000)).toBeNull(); // inside silence
    expect(sourceToOutputMs(baseEdl, 3000)).toBe(1300 + 100);

    expect(outputToSourceMs(baseEdl, 0)).toBe(0);
    expect(outputToSourceMs(baseEdl, 1400)).toBe(3000);
    expect(outputToSourceMs(baseEdl, 99999)).toBe(4200); // clamps to end
  });

  it("finds segments around a source position", () => {
    expect(segmentAtSource(baseEdl, 500)!.id).toBe("seg-k0");
    expect(segmentAtSource(baseEdl, 2000)).toBeNull();
    expect(nextSegmentAfterSource(baseEdl, 2000)!.id).toBe("seg-k1");
    expect(nextSegmentAfterSource(baseEdl, 4200)).toBeNull();
  });
});

describe("removeWords (text-based ripple delete)", () => {
  it("removes a middle word, splitting the segment at gap midpoints", () => {
    const result = removeWords(baseEdl, words, ["w1"]);

    expect(result.timeline).toHaveLength(3);
    const [first, second] = result.timeline;
    expect(first!.wordIds).toEqual(["w0"]);
    expect(second!.wordIds).toEqual(["w2"]);
    // Midpoints: (400+450)/2=425, (800+850)/2=825
    expect(first!.sourceOutMs).toBe(425);
    expect(second!.sourceInMs).toBe(825);

    const userCut = result.removed.find((r) => r.reason === "user");
    expect(userCut).toMatchObject({ sourceInMs: 425, sourceOutMs: 825, wordIds: ["w1"] });

    // Ripple: output shrinks by exactly the removed span.
    expect(edlOutputDurationMs(result)).toBe(edlOutputDurationMs(baseEdl) - 400);
  });

  it("removes a span crossing segment edges and leaves other segments intact", () => {
    const result = removeWords(baseEdl, words, ["w2", "w3"]);
    expect(result.timeline.map((s) => s.wordIds)).toEqual([
      ["w0", "w1"],
      ["w4", "w5"],
    ]);
    expect(result.removed.filter((r) => r.reason === "user")).toHaveLength(2);
  });

  it("is a no-op for unknown ids", () => {
    expect(removeWords(baseEdl, words, ["nope"])).toEqual(baseEdl);
  });
});

describe("restoreRemoved", () => {
  it("round-trips: removing then restoring a word merges segments back", () => {
    const removedOnce = removeWords(baseEdl, words, ["w1"]);
    const cut = removedOnce.removed.find((r) => r.reason === "user")!;
    const restored = restoreRemoved(removedOnce, cut.id);

    expect(restored.timeline).toHaveLength(2);
    const merged = restored.timeline[0]!;
    expect(merged.sourceInMs).toBe(0);
    expect(merged.sourceOutMs).toBe(1300);
    expect(merged.wordIds).toEqual(["w0", "w1", "w2"]);
    expect(edlOutputDurationMs(restored)).toBe(edlOutputDurationMs(baseEdl));
  });

  it("restores silence as its own segment (no words), keeping source order", () => {
    const restored = restoreRemoved(baseEdl, "seg-r0");
    expect(restored.removed).toHaveLength(0);
    // Touching boundaries merge into one continuous segment 0..4200.
    expect(restored.timeline).toHaveLength(1);
    expect(restored.timeline[0]).toMatchObject({ sourceInMs: 0, sourceOutMs: 4200 });
  });
});

describe("segment operations", () => {
  it("trims an edge, clamping to minimum duration and recomputing words", () => {
    const trimmed = trimSegment(baseEdl, "seg-k0", "out", 700, words);
    const segment = trimmed.timeline[0]!;
    expect(segment.sourceOutMs).toBe(700);
    expect(segment.wordIds).toEqual(["w0", "w1"]); // w2 (850–1200) trimmed out

    // Clamp: cannot invert the segment.
    const clamped = trimSegment(baseEdl, "seg-k0", "out", 10, words);
    expect(clamped.timeline[0]!.sourceOutMs).toBe(100); // in(0) + MIN(100)
  });

  it("splits a segment at the playhead, dividing words by time", () => {
    const split = splitSegmentAt(baseEdl, "seg-k0", 600, words);
    expect(split.timeline).toHaveLength(3);
    expect(split.timeline[0]).toMatchObject({ sourceInMs: 0, sourceOutMs: 600 });
    expect(split.timeline[0]!.wordIds).toEqual(["w0", "w1"]); // w1 starts at 450 < 600
    expect(split.timeline[1]).toMatchObject({ sourceInMs: 600, sourceOutMs: 1300 });
    expect(split.timeline[1]!.wordIds).toEqual(["w2"]);

    // Too close to an edge → no-op.
    expect(splitSegmentAt(baseEdl, "seg-k0", 50, words)).toEqual(baseEdl);
  });

  it("reorders segments (output order changes, source times untouched)", () => {
    const reordered = reorderSegment(baseEdl, "seg-k1", 0);
    expect(reordered.timeline.map((s) => s.id)).toEqual(["seg-k1", "seg-k0"]);
    // Output mapping follows the new order.
    expect(outputToSourceMs(reordered, 0)).toBe(2900);
  });

  it("ripple-deletes a segment into removed (restorable, reason user)", () => {
    const deleted = rippleDeleteSegment(baseEdl, "seg-k0");
    expect(deleted.timeline.map((s) => s.id)).toEqual(["seg-k1"]);
    const cut = deleted.removed.find((r) => r.id === "seg-k0")!;
    expect(cut.reason).toBe("user");
    expect(edlOutputDurationMs(deleted)).toBe(1300);

    const restored = restoreRemoved(deleted, "seg-k0");
    expect(restored.timeline.map((s) => s.id)).toEqual(["seg-k0", "seg-k1"]);
  });
});
