import { describe, expect, it } from "vitest";
import {
  ANCHOR_ABOVE_LOWER_THIRD,
  ANCHOR_BELOW_TOP_LOWER_THIRD,
  applyAutoLayout,
  autoCaptionAnchor,
  autoLogoPosition,
  CAPTION_SAFE_MAX,
  CAPTION_SAFE_MIN,
  recommendAspectRatio,
} from "../src/index";

describe("recommendAspectRatio (Build 7.5)", () => {
  it("landscape sources → 16:9 (screen recordings)", () => {
    expect(recommendAspectRatio(1920, 1080)).toBe("16:9");
    expect(recommendAspectRatio(1280, 720)).toBe("16:9");
    expect(recommendAspectRatio(3440, 1440)).toBe("16:9");
  });

  it("portrait sources → 9:16 (selfie camera)", () => {
    expect(recommendAspectRatio(720, 1280)).toBe("9:16");
    expect(recommendAspectRatio(1080, 1920)).toBe("9:16");
  });

  it("near-square sources → 1:1", () => {
    expect(recommendAspectRatio(1000, 1000)).toBe("1:1");
    expect(recommendAspectRatio(1200, 1000)).toBe("1:1");
    expect(recommendAspectRatio(1000, 1100)).toBe("1:1");
  });

  it("unknown/garbage dims → the short-form default", () => {
    expect(recommendAspectRatio(null, null)).toBe("9:16");
    expect(recommendAspectRatio(0, 720)).toBe("9:16");
    expect(recommendAspectRatio(undefined, undefined)).toBe("9:16");
  });

  it("boundary ratios land on the documented sides", () => {
    expect(recommendAspectRatio(1500, 1000)).toBe("16:9"); // exactly 1.5
    expect(recommendAspectRatio(800, 1000)).toBe("9:16"); // exactly 0.8
  });
});

describe("autoCaptionAnchor", () => {
  it("keeps a safe anchor untouched", () => {
    expect(autoCaptionAnchor(0.5)).toBe(0.5);
    expect(autoCaptionAnchor(0.85)).toBe(0.85);
  });

  it("clamps into the title-safe band", () => {
    expect(autoCaptionAnchor(0.02)).toBe(CAPTION_SAFE_MIN);
    expect(autoCaptionAnchor(0.99)).toBe(CAPTION_SAFE_MAX);
    expect(autoCaptionAnchor(NaN)).toBe(CAPTION_SAFE_MAX);
  });

  it("lifts captions above a bottom lower third", () => {
    expect(autoCaptionAnchor(0.86, "bottom-start")).toBe(ANCHOR_ABOVE_LOWER_THIRD);
    expect(autoCaptionAnchor(0.86, "bottom-end")).toBe(ANCHOR_ABOVE_LOWER_THIRD);
    // Already above — untouched.
    expect(autoCaptionAnchor(0.5, "bottom-start")).toBe(0.5);
  });

  it("pushes captions below a top lower third", () => {
    expect(autoCaptionAnchor(0.15, "top-start")).toBe(ANCHOR_BELOW_TOP_LOWER_THIRD);
    expect(autoCaptionAnchor(0.5, "top-end")).toBe(0.5);
  });
});

describe("autoLogoPosition", () => {
  it("defaults to the watermark corner when nothing occupies it", () => {
    expect(autoLogoPosition(0.5)).toBe("top-end");
  });

  it("avoids the lower third's corner", () => {
    expect(autoLogoPosition(0.5, "top-end")).toBe("top-start");
  });

  it("avoids the caption band's corners (bottom captions block bottom)", () => {
    // Bottom captions + bottom lower third: top corners free.
    expect(autoLogoPosition(0.72, "bottom-start")).toBe("top-end");
  });

  it("top captions block the top corners", () => {
    expect(autoLogoPosition(0.3)).toBe("bottom-end");
  });

  it("falls back to top-end when everything is nominally occupied", () => {
    // Mid anchor blocks nothing; force occupation via lower third + extremes:
    // top captions (blocks top pair) + bottom lower third + … bottom-end free.
    expect(autoLogoPosition(0.3, "bottom-end")).toBe("bottom-start");
  });
});

describe("applyAutoLayout", () => {
  it("composes anchor + corner; logo null when no logo in play", () => {
    const layout = applyAutoLayout({
      captionAnchor: 0.86,
      lowerThirdPosition: "bottom-start",
      hasLogo: true,
    });
    expect(layout.captionAnchor).toBe(ANCHOR_ABOVE_LOWER_THIRD);
    expect(layout.logoPosition).toBe("top-end");

    expect(
      applyAutoLayout({ captionAnchor: 0.85, hasLogo: false }).logoPosition,
    ).toBeNull();
  });
});
