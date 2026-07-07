import * as tus from "tus-js-client";

/**
 * Thin wrapper around tus-js-client configured for Supabase Storage's
 * resumable endpoint. Supabase requires 6 MiB chunks; smaller chunks are
 * allowed only in tests (chunkSizeOverride).
 *
 * Resume semantics:
 *  - pause() aborts the HTTP transfer but keeps the server-side session;
 *    resume() continues from the last acknowledged offset.
 *  - In the browser, fingerprints are stored (localStorage) so an upload
 *    interrupted by a tab close/crash resumes when the same file is
 *    re-selected. start() checks for a previous session automatically.
 */

export const SUPABASE_TUS_CHUNK_SIZE = 6 * 1024 * 1024;

export function supabaseTusEndpoint(supabaseUrl: string): string {
  return `${supabaseUrl.replace(/\/$/, "")}/storage/v1/upload/resumable`;
}

export interface ResumableUploadOptions {
  endpoint: string;
  /** Supabase access token of the signed-in user (storage RLS applies). */
  accessToken: string;
  bucket: string;
  objectName: string;
  contentType: string;
  /** File/Blob in the browser; Buffer or stream in Node tests. */
  file: ConstructorParameters<typeof tus.Upload>[0];
  onProgress?: (bytesSent: number, bytesTotal: number | null) => void;
  onSuccess?: () => void;
  onError?: (error: Error) => void;
  /** Explicitly resume an existing session (tests / cross-context resume). */
  uploadUrl?: string;
  /** Tests only — production must use SUPABASE_TUS_CHUNK_SIZE. */
  chunkSizeOverride?: number;
}

export interface ResumableUploadHandle {
  /** Begin (or auto-resume) the upload. */
  start(): void;
  /** Stop transferring but keep the session resumable. */
  pause(): Promise<void>;
  /** Continue after pause() from the last acknowledged offset. */
  resume(): void;
  /** Cancel and delete the server-side session. */
  cancel(): Promise<void>;
  /** tus session URL once created (used to resume across contexts). */
  getUploadUrl(): string | null;
}

export function createResumableUpload(
  options: ResumableUploadOptions,
): ResumableUploadHandle {
  const upload = new tus.Upload(options.file, {
    endpoint: options.endpoint,
    ...(options.uploadUrl ? { uploadUrl: options.uploadUrl } : {}),
    chunkSize: options.chunkSizeOverride ?? SUPABASE_TUS_CHUNK_SIZE,
    retryDelays: [0, 1_000, 3_000, 5_000, 10_000],
    removeFingerprintOnSuccess: true,
    uploadDataDuringCreation: true,
    metadata: {
      bucketName: options.bucket,
      objectName: options.objectName,
      contentType: options.contentType,
      cacheControl: "3600",
    },
    headers: {
      authorization: `Bearer ${options.accessToken}`,
      "x-upsert": "true",
    },
    onProgress: (bytesSent, bytesTotal) =>
      options.onProgress?.(bytesSent, bytesTotal ?? null),
    onSuccess: () => options.onSuccess?.(),
    onError: (error) => options.onError?.(error),
  });

  return {
    start() {
      // Resume a session left over from a previous page load if one exists.
      upload
        .findPreviousUploads()
        .then((previous) => {
          if (previous.length > 0) {
            upload.resumeFromPreviousUpload(previous[0]!);
          }
          upload.start();
        })
        .catch(() => upload.start());
    },
    pause() {
      return upload.abort();
    },
    resume() {
      upload.start();
    },
    cancel() {
      return upload.abort(true);
    },
    getUploadUrl() {
      return upload.url;
    },
  };
}
