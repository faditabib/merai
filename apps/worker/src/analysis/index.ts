import { env } from "../env";
import { log } from "../logger";
import { HaikuAnalysisEngine } from "./haiku";
import { HeuristicAnalysisEngine } from "./heuristic";
import type { AnalysisEngine } from "./types";

export type { AnalysisEngine, AnalysisInput, AnalysisResult } from "./types";
export { analysisResultSchema } from "./types";

/**
 * Engine selection — the ONLY place the Anthropic key is read. Setting
 * ANTHROPIC_API_KEY switches analysis from the heuristic fallback to Claude
 * Haiku with zero code changes (same pattern as the transcription provider).
 * ANALYSIS_ENGINE=heuristic|haiku overrides.
 */
export function createAnalysisEngine(): AnalysisEngine {
  const forced = process.env.ANALYSIS_ENGINE;

  if (forced === "heuristic") {
    log.warn("ANALYSIS_ENGINE=heuristic — context-aware analysis disabled");
    return new HeuristicAnalysisEngine();
  }

  if (env.anthropicApiKey) {
    return HaikuAnalysisEngine.fromApiKey(env.anthropicApiKey);
  }

  if (forced === "haiku") {
    throw new Error("ANALYSIS_ENGINE=haiku but ANTHROPIC_API_KEY is not set");
  }

  log.warn(
    "ANTHROPIC_API_KEY not set — falling back to HeuristicAnalysisEngine (unambiguous fillers only)",
  );
  return new HeuristicAnalysisEngine();
}
