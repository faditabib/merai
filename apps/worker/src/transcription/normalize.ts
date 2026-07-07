import { transcriptWordsSchema, type TranscriptWord } from "@merai/core";
import type { AssemblyAiTranscript, TranscriptionResult } from "./types";

/**
 * Normalize a completed AssemblyAI transcript into the provider-agnostic
 * result. Shared by the real provider AND the mock (whose fixtures are
 * AssemblyAI-shaped), so this exact code path is exercised by mock-based
 * tests before the live key ever arrives.
 */
export function assemblyAiToResult(
  response: AssemblyAiTranscript,
): TranscriptionResult {
  if (response.status !== "completed") {
    throw new Error(
      `Cannot normalize transcript in status "${response.status}"${response.error ? `: ${response.error}` : ""}`,
    );
  }

  const words: TranscriptWord[] = (response.words ?? []).map((word, index) => ({
    id: `w${index}`,
    text: word.text,
    startMs: word.start,
    endMs: word.end,
    confidence: word.confidence,
    ...(word.speaker != null ? { speaker: word.speaker } : {}),
  }));

  // Fail loudly on malformed provider data rather than storing garbage.
  transcriptWordsSchema.parse(words);

  return {
    providerTranscriptId: response.id,
    languageCode: response.language_code,
    durationSeconds: response.audio_duration,
    text: response.text ?? words.map((w) => w.text).join(" "),
    words,
    raw: response,
  };
}
