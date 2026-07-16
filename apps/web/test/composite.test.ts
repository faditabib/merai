import { describe, expect, it } from "vitest";
import { logoBox, OVERLAY_MARGIN_PCT } from "@merai/core";
import {
  clampPipWidth,
  compositeFrameSize,
  pipBox,
  PIP_WIDTH_DEFAULT,
  PIP_WIDTH_MAX,
  PIP_WIDTH_MIN,
  RECORD_MODES,
  streamsForMode,
} from "../src/lib/record/composite";

describe("streamsForMode (Build 7.2)", () => {
  it("camera mode needs only the camera", () => {
    expect(streamsForMode("camera")).toEqual({ camera: true, screen: false });
  });
  it("screen mode needs only the screen", () => {
    expect(streamsForMode("screen")).toEqual({ camera: false, screen: true });
  });
  it("screen-camera needs both", () => {
    expect(streamsForMode("screen-camera")).toEqual({ camera: true, screen: true });
  });
  it("covers every declared mode", () => {
    expect(RECORD_MODES).toEqual(["camera", "screen", "screen-camera"]);
  });
});

describe("pipBox — the camera bubble IS the brand-logo geometry", () => {
  it("matches logoBox exactly for in-range widths (shared placement math)", () => {
    for (const position of ["top-start", "top-end", "bottom-start", "bottom-end"] as const) {
      expect(pipBox(position, 0.22, 9 / 16, 1920, 1080)).toEqual(
        logoBox(position, 0.22, 9 / 16, 1920, 1080),
      );
    }
  });

  it("respects the shared overlay margin", () => {
    const box = pipBox("bottom-end", 0.2, 9 / 16, 1920, 1080);
    const margin = Math.round(Math.min(1920, 1080) * OVERLAY_MARGIN_PCT);
    expect(box.x + box.w).toBe(1920 - margin);
    expect(box.y + box.h).toBe(1080 - margin);
  });

  it("clamps out-of-range widths instead of producing absurd bubbles", () => {
    expect(pipBox("top-start", 0.9, 1, 1000, 1000).w).toBe(
      Math.round(1000 * PIP_WIDTH_MAX),
    );
    expect(pipBox("top-start", 0.01, 1, 1000, 1000).w).toBe(
      Math.round(1000 * PIP_WIDTH_MIN),
    );
  });
});

describe("clampPipWidth", () => {
  it("passes through valid values and clamps the edges", () => {
    expect(clampPipWidth(0.2)).toBe(0.2);
    expect(clampPipWidth(0.5)).toBe(PIP_WIDTH_MAX);
    expect(clampPipWidth(0.01)).toBe(PIP_WIDTH_MIN);
  });
  it("falls back to the default on garbage (non-finite input)", () => {
    expect(clampPipWidth(NaN)).toBe(PIP_WIDTH_DEFAULT);
    expect(clampPipWidth(Infinity)).toBe(PIP_WIDTH_DEFAULT);
  });
});

describe("compositeFrameSize", () => {
  it("keeps native size up to 1920 wide, forced even", () => {
    expect(compositeFrameSize(1280, 720)).toEqual({ w: 1280, h: 720 });
    expect(compositeFrameSize(1281, 721)).toEqual({ w: 1281 % 2 ? 1280 : 1281, h: 720 });
  });
  it("scales ultrawide screens down to 1920 preserving aspect", () => {
    const { w, h } = compositeFrameSize(3840, 2160);
    expect(w).toBe(1920);
    expect(h).toBe(1080);
  });
  it("falls back to 1280x720 when settings are missing", () => {
    expect(compositeFrameSize(0, 0)).toEqual({ w: 1280, h: 720 });
  });
});
