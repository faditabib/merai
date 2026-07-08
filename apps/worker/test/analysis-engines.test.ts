import { describe, expect, it, vi } from "vitest";
import type { TranscriptWord } from "@merai/core";
import { HaikuAnalysisEngine } from "../src/analysis/haiku";
import { HeuristicAnalysisEngine } from "../src/analysis/heuristic";

function word(
  id: string,
  text: string,
  startMs: number,
  confidence = 0.95,
): TranscriptWord {
  return { id, text, startMs, endMs: startMs + 300, confidence };
}

describe("HeuristicAnalysisEngine (keyless fallback)", () => {
  const engine = new HeuristicAnalysisEngine();

  it("removes pure hesitation sounds incl. hamza variants, keeps context-dependent fillers", async () => {
    const result = await engine.analyze({
      words: [
        word("w0", "اه", 0),
        word("w1", "يعني", 400), // context-dependent — must NOT be removed heuristically
        word("w2", "أه", 800), // hamza variant of اه
        word("w3", "طب", 1200), // context-dependent
        word("w4", "um", 1600),
        word("w5", "like", 2000), // context-dependent
        word("w6", "المونتاج", 2400),
      ],
      languageCode: "ar",
    });

    const removed = result.fillers.flatMap((f) => f.wordIds);
    expect(removed).toEqual(["w0", "w2", "w4"]);
    expect(result.falseStarts).toHaveLength(0);
    expect(result.retakes).toHaveLength(0);
  });
});

describe("HaikuAnalysisEngine (stubbed Anthropic client)", () => {
  const words = [
    word("w0", "السلام", 0),
    word("w1", "يعني", 400),
    word("w2", "أهرفع", 800, 0.36), // low confidence → [?] flag
    word("w3", "الفيديو", 1200),
  ];

  const validToolResponse = (input: unknown) =>
    ({
      content: [{ type: "tool_use", id: "tu_1", name: "record_analysis", input }],
      usage: { input_tokens: 500, output_tokens: 80 },
    }) as never;

  it("forces the record_analysis tool on Haiku with candidate flags in the prompt", async () => {
    const createMessage = vi.fn().mockResolvedValue(
      validToolResponse({ fillers: [], falseStarts: [], retakes: [] }),
    );
    const engine = new HaikuAnalysisEngine(createMessage);

    await engine.analyze({ words, languageCode: "ar" });

    const params = createMessage.mock.calls[0]![0];
    expect(params.model).toMatch(/^claude-haiku/); // Haiku ONLY (margin rule)
    expect(params.temperature).toBe(0);
    expect(params.tool_choice).toEqual({ type: "tool", name: "record_analysis" });

    const prompt = params.messages[0].content as string;
    expect(prompt).toContain("w2|0.80|أهرفع [?]"); // low-confidence flag
    expect(prompt).toContain("w1|0.40|يعني [f?]"); // lexicon candidate flag
    expect(prompt).toContain("Language: ar");
  });

  it("parses and returns schema-valid analysis", async () => {
    const engine = new HaikuAnalysisEngine(
      vi.fn().mockResolvedValue(
        validToolResponse({
          fillers: [{ wordIds: ["w1", "w2"], note: "hesitation merge" }],
          falseStarts: [],
          retakes: [],
        }),
      ),
    );

    const result = await engine.analyze({ words, languageCode: "ar" });
    expect(result.fillers[0]!.wordIds).toEqual(["w1", "w2"]);
  });

  it("rejects schema-invalid tool output loudly", async () => {
    const engine = new HaikuAnalysisEngine(
      vi.fn().mockResolvedValue(validToolResponse({ fillers: [{ wordIds: [] }] })),
    );
    await expect(engine.analyze({ words, languageCode: "ar" })).rejects.toThrow(
      /schema validation/,
    );
  });

  it("rejects a response with no tool call", async () => {
    const engine = new HaikuAnalysisEngine(
      vi.fn().mockResolvedValue({
        content: [{ type: "text", text: "sure!" }],
        usage: { input_tokens: 1, output_tokens: 1 },
      } as never),
    );
    await expect(engine.analyze({ words, languageCode: "ar" })).rejects.toThrow(
      /no tool call/,
    );
  });

  it("skips the API entirely for empty transcripts (cost)", async () => {
    const createMessage = vi.fn();
    const engine = new HaikuAnalysisEngine(createMessage);
    const result = await engine.analyze({ words: [], languageCode: null });
    expect(createMessage).not.toHaveBeenCalled();
    expect(result).toEqual({ fillers: [], falseStarts: [], retakes: [] });
  });
});
