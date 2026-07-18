import { MAX_RAW_UPLOAD_BYTES, MAX_RAW_UPLOAD_SECONDS } from "@merai/core";

/**
 * Pure validation shared by the browser (pre-upload UX) and server actions
 * (authoritative gate). Returns an error code (i18n key under
 * upload.errors.*) or null when valid.
 */

export const ALLOWED_VIDEO_MIME_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-matroska",
] as const;

export type UploadValidationError =
  | "unsupported-type"
  | "file-too-large"
  | "video-too-long"
  | "unreadable-duration";

export function validateVideoFile(input: {
  mimeType: string;
  sizeBytes: number;
  durationSeconds: number | null;
}): UploadValidationError | null {
  if (
    !(ALLOWED_VIDEO_MIME_TYPES as readonly string[]).includes(input.mimeType)
  ) {
    return "unsupported-type";
  }
  if (input.sizeBytes <= 0 || input.sizeBytes > MAX_RAW_UPLOAD_BYTES) {
    return "file-too-large";
  }
  if (input.durationSeconds == null || !Number.isFinite(input.durationSeconds)) {
    return "unreadable-duration";
  }
  if (input.durationSeconds <= 0 || input.durationSeconds > MAX_RAW_UPLOAD_SECONDS) {
    return "video-too-long";
  }
  return null;
}

/**
 * Classify a mid-transfer tus/storage failure (Functional Readiness sprint):
 * the storage layer rejects over-limit files with a 413 "exceeded the
 * maximum allowed size" — previously surfaced as a misleading "check your
 * connection". Anything unrecognized stays a network-class failure.
 */
export function classifyUploadFailure(message: string | null | undefined): "file-too-large" | "upload-failed" {
  const text = (message ?? "").toLowerCase();
  if (
    text.includes("413") ||
    text.includes("exceeded the maximum allowed size") ||
    text.includes("payload too large") ||
    text.includes("entity too large")
  ) {
    return "file-too-large";
  }
  return "upload-failed";
}

/** Sanitized file extension for the storage object name. */
export function safeExtension(filename: string): string {
  const match = /\.([a-z0-9]{2,5})$/i.exec(filename);
  return match ? match[1]!.toLowerCase() : "mp4";
}

export interface SceneInput {
  mimeType: string;
  sizeBytes: number;
  durationSeconds: number | null;
}

/**
 * Scene-set validation (Build 7.4): every scene passes the single-file
 * gate AND the combined duration fits the raw cap — the stitched source is
 * one upload, so the cap applies to the SUM (the STT-measured duration on
 * the stitched file stays the authoritative check).
 */
export function validateSceneSet(
  scenes: SceneInput[],
): UploadValidationError | "scenes-too-few" | "scenes-too-long" | null {
  if (scenes.length < 2) return "scenes-too-few";
  let totalSeconds = 0;
  for (const scene of scenes) {
    const sceneError = validateVideoFile(scene);
    if (sceneError) return sceneError;
    totalSeconds += scene.durationSeconds!;
  }
  if (totalSeconds > MAX_RAW_UPLOAD_SECONDS) return "scenes-too-long";
  return null;
}
