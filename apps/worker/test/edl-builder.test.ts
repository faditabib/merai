import { describe, expect, it } from "vitest";
import {
  edlOutputDurationMs,
  SEGMENT_PAD_MS,
  SILENCE_MIN_GAP_MS,
  type TranscriptWord,
} from "@merai/core";
import { buildEdl, type BuildEdlInput } from "../src/edl/build-edl";
import { arabicFixture } from "../src/transcription/fixtures/arabic";
import { assemblyAiToResult } from "../src/transcription/normalize";
import type { AnalysisResult } from "../src/analysis/types";

const NO_ANALYSIS: AnalysisResult = { fillers: [], falseStarts: [], retakes: [] };

function word(id: string, text: string, startMs: number, endMs: number): TranscriptWord {
  return { id, text, startMs, endMs, confidence: 0.95 };
}

function build(
  words: TranscriptWord[],
  analysis: AnalysisResult = NO_ANALYSIS,
  totalDurationMs?: number,
) {
  const input: BuildEdlInput = {
    projectId: "11111111-1111-4111-8111-111111111111",
    sourceUploadId: "22222222-2222-4222-8222-222222222222",
    words,
    analysis,
    aspectRatio: "9:16",
    captionStyle: "minimal-white-bottom",
    totalDurationMs: totalDurationMs ?? null,
  };
  return buildEdl(input);
}

describe("buildEdl", () => {
  it("keeps continuous speech as one padded segment", () => {
    const words = [word("w0", "مرحبا", 500, 900), word("w1", "بكم", 950, 1400)];
    const edl = build(words);

    expect(edl.timeline).toHaveLength(1);
    expect(edl.timeline[0]).toMatchObject({
      sourceInMs: 500 - SEGMENT_PAD_MS,
      sourceOutMs: 1400 + SEGMENT_PAD_MS,
      wordIds: ["w0", "w1"],
    });
    expect(edl.removed).toHaveLength(0);
  });

  it("cuts interior silence between kept words and records it", () => {
    const words = [word("w0", "أهلا", 200, 600), word("w1", "وسهلا", 600 + SILENCE_MIN_GAP_MS + 500, 2500)];
    const edl = build(words);

    expect(edl.timeline).toHaveLength(2);
    const silence = edl.removed.find((r) => r.reason === "silence");
    expect(silence).toBeDefined();
    expect(silence!.sourceInMs).toBe(600 + SEGMENT_PAD_MS);
    expect(silence!.sourceOutMs).toBe(600 + SILENCE_MIN_GAP_MS + 500 - SEGMENT_PAD_MS);
  });

  it("removes leading and trailing silence", () => {
    const words = [word("w0", "كلمة", 2000, 2400)];
    const edl = build(words, NO_ANALYSIS, 6000);

    const silences = edl.removed.filter((r) => r.reason === "silence");
    expect(silences).toHaveLength(2);
    expect(silences[0]!.sourceInMs).toBe(0);
    expect(silences[1]!.sourceOutMs).toBe(6000);
  });

  it("splits pad overlap at the midpoint when a single filler is cut out", () => {
    const words = [
      word("w0", "هذا", 0, 400),
      word("w1", "اه", 450, 650), // removed filler — gap smaller than 2×pad
      word("w2", "رائع", 700, 1100),
    ];
    const edl = build(words, {
      fillers: [{ wordIds: ["w1"] }],
      falseStarts: [],
      retakes: [],
    });

    expect(edl.timeline).toHaveLength(2);
    const [first, second] = edl.timeline;
    expect(first!.sourceOutMs).toBeLessThanOrEqual(second!.sourceInMs); // no overlap
    expect(edl.removed).toHaveLength(1);
    expect(edl.removed[0]).toMatchObject({ reason: "filler", wordIds: ["w1"] });
  });

  it("applies retakes (keeps the chosen take) and false starts with correct reasons", () => {
    const words = [
      word("w0", "اليوم", 0, 400),
      word("w1", "نتكلم", 450, 850), // false start ends here
      word("w2", "اليوم", 3000, 3400), // take 2 (kept)
      word("w3", "نتكلم", 3450, 3850),
      word("w4", "عن", 3900, 4100),
    ];
    const edl = build(words, {
      fillers: [],
      falseStarts: [{ startWordId: "w0", endWordId: "w1", note: "abandoned" }],
      retakes: [],
    });

    expect(edl.removed).toHaveLength(1);
    expect(edl.removed[0]).toMatchObject({
      reason: "false-start",
      wordIds: ["w0", "w1"],
      note: "abandoned",
    });
    expect(edl.timeline).toHaveLength(1);
    expect(edl.timeline[0]!.wordIds).toEqual(["w2", "w3", "w4"]);
  });

  it("ignores unknown/inverted word ranges from the AI instead of crashing", () => {
    const words = [word("w0", "سلام", 0, 400)];
    const edl = build(words, {
      fillers: [{ wordIds: ["w99"] }],
      falseStarts: [{ startWordId: "w5", endWordId: "w2" }],
      retakes: [],
    });
    expect(edl.timeline).toHaveLength(1);
    expect(edl.removed).toHaveLength(0);
  });

  it("integrates with the Arabic fixture: retake group removed, output shorter than source", () => {
    const result = assemblyAiToResult(arabicFixture);
    // Simulate Haiku output: take 1 (w0..w9) is the weaker retake.
    const edl = build(
      result.words,
      {
        fillers: [{ wordIds: ["w2"], note: "يعني as discourse filler" }],
        falseStarts: [],
        retakes: [
          {
            takes: [
              { startWordId: "w0", endWordId: "w9" },
              { startWordId: "w10", endWordId: "w19" },
            ],
            keepIndex: 1,
            note: "second take cleaner",
          },
        ],
      },
      (arabicFixture.audio_duration ?? 0) * 1000,
    );

    const reasons = new Set(edl.removed.map((r) => r.reason));
    expect(reasons.has("bad-take")).toBe(true);
    expect(reasons.has("silence")).toBe(true); // 900ms lead-in + 1.4s breath pause

    const sourceMs = (arabicFixture.audio_duration ?? 0) * 1000;
    const outputMs = edlOutputDurationMs(edl);
    expect(outputMs).toBeGreaterThan(0);
    expect(outputMs).toBeLessThan(sourceMs * 0.75);

    // Kept timeline is strictly ordered and non-overlapping.
    for (let i = 1; i < edl.timeline.length; i++) {
      expect(edl.timeline[i]!.sourceInMs).toBeGreaterThanOrEqual(
        edl.timeline[i - 1]!.sourceOutMs,
      );
    }
  });
});
