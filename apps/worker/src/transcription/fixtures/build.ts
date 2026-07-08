import type { AssemblyAiTranscript, AssemblyAiWord } from "../types";

/**
 * Fixture builder producing exactly AssemblyAI's completed-transcript shape.
 * Input is a compact spec: [text, durationMs, gapAfterMs?, confidence?].
 * Silence between takes is expressed as a large gapAfterMs on the preceding
 * word — AssemblyAI represents silence implicitly as gaps between word
 * timestamps, never as word entries.
 */

export type WordSpec = [
  text: string,
  durationMs: number,
  gapAfterMs?: number,
  confidence?: number,
];

export function buildFixture(options: {
  id: string;
  languageCode: string;
  words: WordSpec[];
  /** Leading silence before the first word, ms. */
  leadInMs?: number;
  /** Trailing silence after the last word, ms. */
  leadOutMs?: number;
}): AssemblyAiTranscript {
  const leadIn = options.leadInMs ?? 400;
  const leadOut = options.leadOutMs ?? 600;

  let cursor = leadIn;
  const words: AssemblyAiWord[] = options.words.map(
    ([text, duration, gapAfter = 60, confidence = 0.95]) => {
      const start = cursor;
      const end = start + duration;
      cursor = end + gapAfter;
      return { text, start, end, confidence, speaker: null };
    },
  );

  const lastEnd = words.length > 0 ? words[words.length - 1]!.end : 0;
  const totalConfidence =
    words.length > 0
      ? words.reduce((sum, w) => sum + w.confidence, 0) / words.length
      : null;

  return {
    id: options.id,
    status: "completed",
    text: words.map((w) => w.text).join(" "),
    words,
    language_code: options.languageCode,
    audio_duration: Math.round((lastEnd + leadOut) / 1000),
    confidence: totalConfidence,
    error: null,
    // Fields present on real responses that downstream code must tolerate
    // in transcripts.raw without depending on them:
    audio_url: "https://example.invalid/mock-audio",
    punctuate: true,
    format_text: true,
    disfluencies: true,
    language_detection: false,
    speech_models: ["universal-3-5-pro", "universal-2"],
    utterances: null,
    webhook_url: null,
  };
}
