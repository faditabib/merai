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

/**
 * Deterministic output corrections for product terms. Probed live 2026-07-08:
 * word_boost is a no-op for Arabic (accepted, zero effect), custom_spelling
 * works and fixed ميري → ميراي at the word level. Trade-off: these tokens are
 * force-mapped even when the speaker meant something else (e.g. ميري as a
 * name) — acceptable for product-context recordings; see DECISIONS.md.
 */
const CUSTOM_SPELLING = [
  { from: ["ميري", "ميراى"], to: "ميراي" },
  { from: ["Mireille", "Miray", "Mirai"], to: "Merai" },
];

export interface AssemblyAIProviderOptions {
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
}

/**
 * Real AssemblyAI implementation: submit by URL, poll until terminal.
 * Cost note: STT is billed on raw minutes submitted — the 10-minute upload
 * cap is the cost ceiling per job.
 */
export class AssemblyAIProvider implements TranscriptionProvider {
  readonly name = "assemblyai";

  private readonly pollIntervalMs: number;
  private readonly pollTimeoutMs: number;

  constructor(
    private readonly apiKey: string,
    options: AssemblyAIProviderOptions = {},
  ) {
    this.pollIntervalMs = options.pollIntervalMs ?? 3_000;
    // Generous for a 10-minute max upload.
    this.pollTimeoutMs = options.pollTimeoutMs ?? 15 * 60_000;
  }

  async transcribe(request: TranscriptionRequest): Promise<TranscriptionResult> {
    const audioUrl = await request.getAudioUrl();

    const submitted = await this.post<AssemblyAiTranscript>("/transcript", {
      audio_url: audioUrl,
      // Preference list per current API (speech_model was deprecated live,
      // 2026-07-08): newest pro model first, universal-2 as fallback.
      speech_models: ["universal-3-5-pro", "universal-2"],
      punctuate: true,
      format_text: true,
      // Keep hesitation sounds (um/uh/اه) in the transcript — Phase 2's
      // filler removal depends on them being present.
      disfluencies: true,
      custom_spelling: CUSTOM_SPELLING,
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
    const deadline = Date.now() + this.pollTimeoutMs;

    while (Date.now() < deadline) {
      const transcript = await this.get<AssemblyAiTranscript>(`/transcript/${id}`);

      if (transcript.status === "completed") return transcript;
      if (transcript.status === "error") {
        throw new Error(`AssemblyAI transcription failed: ${transcript.error}`);
      }
      await sleep(this.pollIntervalMs);
    }

    throw new Error(
      `AssemblyAI transcript ${id} timed out after ${this.pollTimeoutMs}ms`,
    );
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
