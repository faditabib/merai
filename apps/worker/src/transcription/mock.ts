import { setTimeout as sleep } from "node:timers/promises";
import { log } from "../logger";
import { arabicFixture } from "./fixtures/arabic";
import { englishFixture } from "./fixtures/english";
import { assemblyAiToResult } from "./normalize";
import type {
  TranscriptionProvider,
  TranscriptionRequest,
  TranscriptionResult,
} from "./types";

/**
 * Fixture-backed provider for local development and tests. Returns
 * AssemblyAI-shaped payloads and pushes them through the SAME normalization
 * path as the real provider, so the full pipeline is exercised without an
 * API key. Never intended for production.
 */
export class MockTranscriptionProvider implements TranscriptionProvider {
  readonly name = "mock";

  constructor(private readonly simulatedLatencyMs = 1500) {}

  async transcribe(request: TranscriptionRequest): Promise<TranscriptionResult> {
    log.warn(
      `MockTranscriptionProvider: returning fixture data for upload ${request.uploadId} (no real transcription)`,
    );
    await sleep(this.simulatedLatencyMs);

    // "auto" resolves to Arabic — the product default.
    const fixture = request.languageHint === "en" ? englishFixture : arabicFixture;

    const result = assemblyAiToResult({
      ...fixture,
      // Unique per upload so idempotency/dedupe behaves like production.
      id: `mock-${request.uploadId}`,
    });
    return result;
  }
}
