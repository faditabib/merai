import { describe, expect, it } from "vitest";
import { MAX_RAW_UPLOAD_BYTES, MAX_RAW_UPLOAD_SECONDS } from "@merai/core";
import {
  safeExtension,
  validateSceneSet,
  validateVideoFile,
} from "../src/lib/upload/validate";

const valid = {
  mimeType: "video/mp4",
  sizeBytes: 50 * 1024 * 1024,
  durationSeconds: 300,
};

describe("validateVideoFile (shared client/server gate)", () => {
  it("accepts a normal 5-minute mp4", () => {
    expect(validateVideoFile(valid)).toBeNull();
  });

  it("accepts exactly the 10-minute cap", () => {
    expect(
      validateVideoFile({ ...valid, durationSeconds: MAX_RAW_UPLOAD_SECONDS }),
    ).toBeNull();
  });

  it("rejects anything over 10 minutes", () => {
    expect(
      validateVideoFile({ ...valid, durationSeconds: MAX_RAW_UPLOAD_SECONDS + 1 }),
    ).toBe("video-too-long");
    expect(validateVideoFile({ ...valid, durationSeconds: 660 })).toBe(
      "video-too-long",
    );
  });

  it("rejects unsupported container types", () => {
    expect(validateVideoFile({ ...valid, mimeType: "video/x-msvideo" })).toBe(
      "unsupported-type",
    );
    expect(validateVideoFile({ ...valid, mimeType: "audio/mpeg" })).toBe(
      "unsupported-type",
    );
    expect(validateVideoFile({ ...valid, mimeType: "" })).toBe("unsupported-type");
  });

  it("rejects oversized and empty files", () => {
    expect(
      validateVideoFile({ ...valid, sizeBytes: MAX_RAW_UPLOAD_BYTES + 1 }),
    ).toBe("file-too-large");
    expect(validateVideoFile({ ...valid, sizeBytes: 0 })).toBe("file-too-large");
  });

  it("rejects unreadable durations (metadata probe failed)", () => {
    expect(validateVideoFile({ ...valid, durationSeconds: null })).toBe(
      "unreadable-duration",
    );
    expect(validateVideoFile({ ...valid, durationSeconds: Number.NaN })).toBe(
      "unreadable-duration",
    );
    expect(validateVideoFile({ ...valid, durationSeconds: 0 })).toBe(
      "video-too-long",
    );
  });
});

describe("safeExtension", () => {
  it("extracts and lowercases known extensions", () => {
    expect(safeExtension("Clip.MP4")).toBe("mp4");
    expect(safeExtension("راو-فوتاج.mov")).toBe("mov");
    expect(safeExtension("a.b.webm")).toBe("webm");
  });

  it("falls back to mp4 for missing or bizarre extensions", () => {
    expect(safeExtension("noextension")).toBe("mp4");
    expect(safeExtension("weird.")).toBe("mp4");
    expect(safeExtension("x.averylongext")).toBe("mp4");
  });
});

describe("validateSceneSet (Build 7.4 — multi-scene projects)", () => {
  const scene = (durationSeconds: number) => ({
    mimeType: "video/webm",
    sizeBytes: 10 * 1024 * 1024,
    durationSeconds,
  });

  it("accepts two scenes within the combined cap", () => {
    expect(validateSceneSet([scene(200), scene(300)])).toBeNull();
  });

  it("accepts scenes summing to exactly the cap", () => {
    expect(
      validateSceneSet([scene(MAX_RAW_UPLOAD_SECONDS / 2), scene(MAX_RAW_UPLOAD_SECONDS / 2)]),
    ).toBeNull();
  });

  it("rejects fewer than two scenes", () => {
    expect(validateSceneSet([scene(60)])).toBe("scenes-too-few");
    expect(validateSceneSet([])).toBe("scenes-too-few");
  });

  it("rejects a combined duration over the cap", () => {
    expect(validateSceneSet([scene(400), scene(300)])).toBe("scenes-too-long");
  });

  it("surfaces a per-scene failure (bad type wins over the sum check)", () => {
    expect(
      validateSceneSet([scene(60), { ...scene(60), mimeType: "image/png" }]),
    ).toBe("unsupported-type");
  });
});
