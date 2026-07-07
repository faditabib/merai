import { setTimeout as sleep } from "node:timers/promises";
import { log } from "../logger";
import { assemblyAiToResult } from "./normalize";
import type {
  AssemblyAiTranscript,
  TranscriptionProvider,
  TranscriptionRequest,
  TranscriptionResult,
} from "./types";

const API_BASE = "https://api.assemblyai.com/v2";
const POLL_INTERVAL_MS = 3_000;
const POLL_TIMEOUT_MS = 15 * 60_000; // generous for a 10-min max upload

/**
 * Real AssemblyAI implementation: submit by URL, poll until terminal.
 * Cost note: STT is billed on raw minutes submitted — the 10-minute upload
 * cap is the cost ceiling per job.
 */
export class AssemblyAIProvider implements TranscriptionProvider {
  readonly name = "assemblyai";

  constructor(private readonly apiKey: string) {}

  async transcribe(request: TranscriptionRequest): Promise<TranscriptionResult> {
    const audioUrl = await request.getAudioUrl();

    const submitted = await this.post<AssemblyAiTranscript>("/transcript", {
      audio_url: audioUrl,
      speech_model: "universal",
      punctuate: true,
      format_text: true,
      // Keep hesitation sounds (um/uh/اه) in the transcript — Phase 2's
      // filler removal depends on them being present.
      disfluencies: true,
      ...(request.languageHint === "auto"
        ? { language_detection: true }
        : { language_code: request.languageHint }),
    });

    log.info(
      `assemblyai: submitted transcript ${submitted.id} for upload ${request.uploadId}`,
    );

    const completed = await this.pollUntilDone(submitted.id);
    return assemblyAiToResult(completed);
  }

  private async pollUntilDone(id: string): Promise<AssemblyAiTranscript> {
    const deadline = Date.now() + POLL_TIMEOUT_MS;

    while (Date.now() < deadline) {
      const transcript = await this.get<AssemblyAiTranscript>(`/transcript/${id}`);

      if (transcript.status === "completed") return transcript;
      if (transcript.status === "error") {
        throw new Error(`AssemblyAI transcription failed: ${transcript.error}`);
      }
      await sleep(POLL_INTERVAL_MS);
    }

    throw new Error(`AssemblyAI transcript ${id} timed out after ${POLL_TIMEOUT_MS}ms`);
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>("POST", path, body);
  }

  private async get<T>(path: string): Promise<T> {
    return this.request<T>("GET", path);
  }

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
  ): Promise<T> {
    const response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        authorization: this.apiKey,
        "content-type": "application/json",
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(
        `AssemblyAI ${method} ${path} failed with ${response.status}: ${detail.slice(0, 500)}`,
      );
    }
    return (await response.json()) as T;
  }
}
