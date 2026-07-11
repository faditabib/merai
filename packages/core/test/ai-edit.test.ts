import { describe, expect, it } from "vitest";
import {
  aiEditPlanSchema,
  validateAiEditPlan,
  type AiEditPlan,
  type EdlV1,
  type TranscriptWord,
} from "../src/index";

function word(id: string, startMs: number, endMs: number): TranscriptWord {
  return { id, text: id, startMs, endMs, confidence: 0.95 };
}

const words: TranscriptWord[] = [
  word("w0", 100, 400),
  word("w1", 450, 800),
  word("w2", 850, 1200),
  word("w3", 3000, 3300),
];

const edl: EdlV1 = {
  version: 1,
  projectId: "11111111-1111-4111-8111-111111111111",
  sourceUploadId: "22222222-2222-4222-8222-222222222222",
  timeline: [
    { id: "seg-k0", sourceInMs: 0, sourceOutMs: 1300, wordIds: ["w0", "w1", "w2"] },
    { id: "seg-k1", sourceInMs: 2900, sourceOutMs: 3400, wordIds: ["w3"] },
  ],
  removed: [
    { id: "seg-r0", sourceInMs: 1300, sourceOutMs: 2900, reason: "silence" },
  ],
  aspectRatio: "9:16",
  captionStyle: "minimal-white-bottom",
};

describe("aiEditPlanSchema", () => {
  it("accepts a well-formed plan and rejects malformed ones", () => {
    const plan: AiEditPlan = {
      goal: "make-shorter",
      commands: [{ type: "ripple-delete-segment", segmentId: "seg-k1" }],
      explanation: "حذفنا مقطعًا بطيئًا في النهاية.",
    };
    expect(aiEditPlanSchema.parse(plan)).toBeTruthy();
    expect(() => aiEditPlanSchema.parse({ ...plan, explanation: "" })).toThrow();
    expect(() =>
      aiEditPlanSchema.parse({ ...plan, commands: [{ type: "explode" }] }),
    ).toThrow();
  });
});

describe("validateAiEditPlan", () => {
  it("dry-runs a valid plan and returns the resulting EDL", () => {
    const result = validateAiEditPlan(edl, words, {
      goal: "tiktok-version",
      commands: [
        { type: "ripple-delete-segment", segmentId: "seg-k1" },
        { type: "set-caption-style", styleToken: "karaoke-highlight" },
        { type: "set-aspect-ratio", aspectRatio: "9:16" },
      ],
      explanation: "قصير وأسرع مع ترجمة بارزة.",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.edl.timeline.map((s) => s.id)).toEqual(["seg-k0"]);
      expect(result.edl.captionStyle).toBe("karaoke-highlight");
      // Base EDL untouched (pure).
      expect(edl.timeline).toHaveLength(2);
    }
  });

  it("rejects command types outside the v1 allowlist", () => {
    const result = validateAiEditPlan(edl, words, {
      goal: "g",
      commands: [{ type: "trim-segment", segmentId: "seg-k0", edge: "out", ms: 900 }],
      explanation: "x",
    });
    expect(result).toMatchObject({ ok: false, reason: "command-type-not-allowed" });
  });

  it("rejects references to ids that do not exist in the base EDL", () => {
    expect(
      validateAiEditPlan(edl, words, {
        goal: "g",
        commands: [{ type: "ripple-delete-segment", segmentId: "seg-nope" }],
        explanation: "x",
      }),
    ).toMatchObject({ ok: false, reason: "unknown-segment" });

    expect(
      validateAiEditPlan(edl, words, {
        goal: "g",
        commands: [{ type: "remove-words", wordIds: ["w0", "w-ghost"] }],
        explanation: "x",
      }),
    ).toMatchObject({ ok: false, reason: "unknown-word" });

    expect(
      validateAiEditPlan(edl, words, {
        goal: "g",
        commands: [{ type: "set-caption-style", styleToken: "comic-sans" }],
        explanation: "x",
      }),
    ).toMatchObject({ ok: false, reason: "unknown-caption-style" });
  });

  it("drops already-removed word ids (intent satisfied) but rejects hallucinated ids", () => {
    // w3 is kept; pretend wX was removed by the first draft (exists in words,
    // not in any kept segment).
    const wordsWithRemoved = [...words, word("wX", 5000, 5300)];
    const result = validateAiEditPlan(edl, wordsWithRemoved, {
      goal: "make-shorter",
      commands: [{ type: "remove-words", wordIds: ["wX", "w3"] }],
      explanation: "x",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Normalized: only the still-kept word survives in the stored command.
      expect(result.commands).toEqual([{ type: "remove-words", wordIds: ["w3"] }]);
    }

    // A command that is ENTIRELY already-satisfied disappears.
    const noop = validateAiEditPlan(edl, wordsWithRemoved, {
      goal: "g",
      commands: [{ type: "remove-words", wordIds: ["wX"] }],
      explanation: "x",
    });
    expect(noop.ok).toBe(true);
    if (noop.ok) expect(noop.commands).toEqual([]);
  });

  it("accepts an empty plan (no changes suggested)", () => {
    const result = validateAiEditPlan(edl, words, {
      goal: "already-good",
      commands: [],
      explanation: "الفيديو ممتاز كما هو.",
    });
    expect(result.ok).toBe(true);
  });
});
