import { describe, expect, it } from "vitest";
import {
  containerOfMime,
  createElapsedTracker,
  extensionForMime,
  formatElapsed,
  pickRecorderMimeType,
  takeFilename,
  trackerElapsedMs,
  trackerPause,
  trackerStart,
} from "../src/lib/record/recorder";
import { ALLOWED_VIDEO_MIME_TYPES, validateVideoFile } from "../src/lib/upload/validate";

describe("pickRecorderMimeType (Build 7.1)", () => {
  it("prefers vp9 webm when supported", () => {
    expect(pickRecorderMimeType(() => true)).toBe("video/webm;codecs=vp9,opus");
  });

  it("falls back through vp8 → bare webm → mp4 (Safari)", () => {
    expect(pickRecorderMimeType((m) => !m.includes("vp9"))).toBe(
      "video/webm;codecs=vp8,opus",
    );
    expect(pickRecorderMimeType((m) => !m.includes("codecs"))).toBe("video/webm");
    expect(pickRecorderMimeType((m) => m === "video/mp4")).toBe("video/mp4");
  });

  it("returns null when nothing is supported", () => {
    expect(pickRecorderMimeType(() => false)).toBeNull();
  });

  it("every candidate's container is accepted by the upload validator", () => {
    for (const candidate of [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
      "video/mp4",
    ]) {
      expect(ALLOWED_VIDEO_MIME_TYPES as readonly string[]).toContain(
        containerOfMime(candidate),
      );
    }
  });
});

describe("recorded take → upload validator (regression, found live)", () => {
  it("a take typed with the CONTAINER mime passes validation; the raw codec-qualified mime would not", () => {
    const recorderMime = "video/webm;codecs=vp9,opus";
    // What RecordFlow does: type the File with the container.
    expect(
      validateVideoFile({
        mimeType: containerOfMime(recorderMime),
        sizeBytes: 2_000_000,
        durationSeconds: 38,
      }),
    ).toBeNull();
    // The bug: the codec-qualified string is NOT an allowed type.
    expect(
      validateVideoFile({
        mimeType: recorderMime,
        sizeBytes: 2_000_000,
        durationSeconds: 38,
      }),
    ).toBe("unsupported-type");
  });
});

describe("take filenames", () => {
  it("derives extension from the container", () => {
    expect(extensionForMime("video/webm;codecs=vp9,opus")).toBe("webm");
    expect(extensionForMime("video/mp4")).toBe("mp4");
  });

  it("numbers takes deterministically", () => {
    expect(takeFilename(1, "video/webm;codecs=vp8,opus")).toBe("recording-take-1.webm");
    expect(takeFilename(3, "video/mp4")).toBe("recording-take-3.mp4");
  });
});

describe("elapsed tracker (pause-excluding)", () => {
  it("accumulates only recording segments", () => {
    const t = createElapsedTracker();
    trackerStart(t, 1000);
    trackerPause(t, 4000); // 3s recorded
    // 5s paused
    trackerStart(t, 9000);
    expect(trackerElapsedMs(t, 11_000)).toBe(5000); // 3s + 2s
  });

  it("open segment counts up to `now`", () => {
    const t = createElapsedTracker();
    trackerStart(t, 0);
    expect(trackerElapsedMs(t, 2500)).toBe(2500);
  });

  it("double start/resume is idempotent while a segment is open", () => {
    const t = createElapsedTracker();
    trackerStart(t, 0);
    trackerStart(t, 500); // ignored
    expect(trackerElapsedMs(t, 1000)).toBe(1000);
  });

  it("pause without a segment is a no-op", () => {
    const t = createElapsedTracker();
    trackerPause(t, 100);
    expect(trackerElapsedMs(t, 200)).toBe(0);
  });
});

describe("formatElapsed", () => {
  it("renders mm:ss", () => {
    expect(formatElapsed(0)).toBe("00:00");
    expect(formatElapsed(61_000)).toBe("01:01");
    expect(formatElapsed(600_000)).toBe("10:00");
  });
});
