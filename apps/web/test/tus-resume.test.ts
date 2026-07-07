import { randomBytes } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createResumableUpload,
  type ResumableUploadHandle,
} from "../src/lib/upload/tus-uploader";
import { startTusServer, type TestTusServer } from "./helpers/tus-server";

/**
 * Drives the REAL tus-js-client (same wrapper the browser uses) against an
 * in-memory tus server to verify the resumable behaviors the product depends
 * on: chunked transfer, pause/resume from the acknowledged offset, automatic
 * recovery from a killed connection, and cancel deleting the session.
 */

const CHUNK = 128 * 1024;
const FILE_SIZE = 1024 * 1024; // 1 MiB → 8 chunks

let server: TestTusServer;

beforeEach(async () => {
  server = await startTusServer();
});

afterEach(async () => {
  await server.close();
});

function uploadOptions(
  data: Buffer,
  hooks: {
    onProgress?: (sent: number, total: number | null) => void;
    onSuccess?: () => void;
    onError?: (error: Error) => void;
  },
) {
  return {
    endpoint: server.url,
    accessToken: "test-token",
    bucket: "raw-uploads",
    objectName: "owner/upload/original.mp4",
    contentType: "video/mp4",
    file: data,
    chunkSizeOverride: CHUNK,
    ...hooks,
  };
}

describe("resumable upload (tus)", () => {
  it("uploads a file in chunks and the server receives identical bytes", async () => {
    const data = randomBytes(FILE_SIZE);

    await new Promise<void>((resolve, reject) => {
      const handle = createResumableUpload(
        uploadOptions(data, { onSuccess: resolve, onError: reject }),
      );
      handle.start();
    });

    const session = [...server.sessions.values()][0]!;
    expect(session.offset).toBe(FILE_SIZE);
    expect(session.data.equals(data)).toBe(true);
  });

  it("pause() keeps a partial upload; resume() completes it from the offset", async () => {
    const data = randomBytes(FILE_SIZE);
    let offsetAtPause = -1;

    await new Promise<void>((resolve, reject) => {
      let pausedOnce = false;
      const handle: ResumableUploadHandle = createResumableUpload(
        uploadOptions(data, {
          onProgress: (sent) => {
            if (!pausedOnce && sent >= CHUNK * 2) {
              pausedOnce = true;
              void handle
                .pause()
                .then(async () => {
                  // Mid-flight state: server holds a strict subset.
                  const session = [...server.sessions.values()][0]!;
                  offsetAtPause = session.offset;
                  await sleep(50);
                  handle.resume();
                })
                .catch(reject);
            }
          },
          onSuccess: resolve,
          onError: reject,
        }),
      );
      handle.start();
    });

    expect(offsetAtPause).toBeGreaterThan(0);
    expect(offsetAtPause).toBeLessThan(FILE_SIZE);

    const session = [...server.sessions.values()][0]!;
    expect(session.offset).toBe(FILE_SIZE);
    expect(session.data.equals(data)).toBe(true);
  });

  it("recovers automatically when the connection dies mid-transfer", async () => {
    const data = randomBytes(FILE_SIZE);
    server.sabotagePatches(2); // kill the first two PATCH sockets

    await new Promise<void>((resolve, reject) => {
      const handle = createResumableUpload(
        uploadOptions(data, { onSuccess: resolve, onError: reject }),
      );
      handle.start();
    });

    expect(server.killedPatches()).toBe(2); // failures actually happened
    const session = [...server.sessions.values()][0]!;
    expect(session.offset).toBe(FILE_SIZE);
    expect(session.data.equals(data)).toBe(true);
  });

  it("cancel() terminates the upload and deletes the server-side session", async () => {
    const data = randomBytes(FILE_SIZE);

    await new Promise<void>((resolve, reject) => {
      let cancelled = false;
      const handle: ResumableUploadHandle = createResumableUpload(
        uploadOptions(data, {
          onProgress: (sent) => {
            if (!cancelled && sent >= CHUNK) {
              cancelled = true;
              void handle.cancel().then(resolve).catch(reject);
            }
          },
          onSuccess: () => reject(new Error("upload should not complete")),
          onError: reject,
        }),
      );
      handle.start();
    });

    // Session was created, then removed by the DELETE.
    await sleep(50);
    expect(server.sessions.size).toBe(0);
  });
});
