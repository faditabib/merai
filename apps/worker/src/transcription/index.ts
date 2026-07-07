import { env } from "../env";
import { log } from "../logger";
import { AssemblyAIProvider } from "./assemblyai";
import { MockTranscriptionProvider } from "./mock";
import type { TranscriptionProvider } from "./types";

export type { TranscriptionProvider, TranscriptionRequest, TranscriptionResult } from "./types";

/**
 * Provider selection — the ONLY place the AssemblyAI key is read.
 * Going live requires exactly one change: set ASSEMBLYAI_API_KEY in the
 * worker env. No code changes, no flags.
 *
 * TRANSCRIPTION_PROVIDER=mock forces the mock even when a key is present
 * (useful for cheap local runs); =assemblyai fails fast if the key is absent.
 */
export function createTranscriptionProvider(): TranscriptionProvider {
  const forced = process.env.TRANSCRIPTION_PROVIDER;

  if (forced === "mock") {
    log.warn("TRANSCRIPTION_PROVIDER=mock — using fixture transcription provider");
    return new MockTranscriptionProvider();
  }

  if (env.assemblyAiApiKey) {
    return new AssemblyAIProvider(env.assemblyAiApiKey);
  }

  if (forced === "assemblyai") {
    throw new Error(
      "TRANSCRIPTION_PROVIDER=assemblyai but ASSEMBLYAI_API_KEY is not set",
    );
  }

  log.warn(
    "ASSEMBLYAI_API_KEY not set — falling back to MockTranscriptionProvider (fixture data, dev only)",
  );
  return new MockTranscriptionProvider();
}
