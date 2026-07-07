import type { TranscriptWord } from "@merai/core";

/**
 * Provider-agnostic transcription contract. The transcribe job handler only
 * knows this interface; AssemblyAI is one implementation, the fixture-backed
 * mock is another. Swapping mock → live is purely an env concern (factory in
 * ./index.ts) — zero code changes.
 */

export interface TranscriptionRequest {
  uploadId: string;
  /** Project's source language; "auto" lets the provider detect. */
  languageHint: "ar" | "en" | "auto";
  /**
   * Lazily creates a short-lived signed URL for the raw media. Lazy so the
   * mock provider never needs storage access.
   */
  getAudioUrl: () => Promise<string>;
}

export interface TranscriptionResult {
  providerTranscriptId: string;
  /** BCP-47-ish code as reported by the provider (e.g. "ar", "en_us"). */
  languageCode: string | null;
  /** Authoritative media duration in seconds, as measured by the provider. */
  durationSeconds: number | null;
  text: string;
  /** Normalized word-level timestamps (see @merai/core transcript.ts). */
  words: TranscriptWord[];
  /** Full provider payload, stored in transcripts.raw for re-analysis. */
  raw: unknown;
}

export interface TranscriptionProvider {
  readonly name: string;
  transcribe(request: TranscriptionRequest): Promise<TranscriptionResult>;
}

// --- AssemblyAI wire types (subset we consume; raw keeps everything) ---

export interface AssemblyAiWord {
  text: string;
  /** ms */
  start: number;
  /** ms */
  end: number;
  confidence: number;
  speaker: string | null;
}

export interface AssemblyAiTranscript {
  id: string;
  status: "queued" | "processing" | "completed" | "error";
  text: string | null;
  words: AssemblyAiWord[] | null;
  language_code: string | null;
  /** seconds */
  audio_duration: number | null;
  confidence: number | null;
  error: string | null;
  [key: string]: unknown;
}
