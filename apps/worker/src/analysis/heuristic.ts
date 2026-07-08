import { isUnambiguousFiller } from "@merai/core";
import type { AnalysisEngine, AnalysisInput, AnalysisResult } from "./types";

/**
 * Keyless fallback engine: removes ONLY pure hesitation sounds (اه/امم/um/uh
 * — no lexical meaning in any context). Context-dependent fillers (يعني، طب،
 * like), false starts and retakes require the AI engine; guessing at them
 * heuristically risks cutting real content, which is worse than leaving
 * filler in.
 */
export class HeuristicAnalysisEngine implements AnalysisEngine {
  readonly name = "heuristic";

  async analyze(input: AnalysisInput): Promise<AnalysisResult> {
    return {
      fillers: input.words
        .filter((word) => isUnambiguousFiller(word.text))
        .map((word) => ({ wordIds: [word.id], note: "hesitation sound" })),
      falseStarts: [],
      retakes: [],
    };
  }
}
