import { describe, expect, it } from "vitest";
import { CAPTION_STYLE_SPECS } from "@merai/core";
import {
  CAPTION_ANCHOR_ABOVE_LOWER_THIRD,
  captionSpecAboveLowerThird,
} from "../src/render/captions";

/**
 * Caption/lower-third collision avoidance (Build 6B.1 live E2E finding).
 * A lower third occupies the bottom band; bottom-anchored captions must lift
 * above it, while centered/high styles and the unbranded path stay untouched.
 */
describe("captionSpecAboveLowerThird", () => {
  const bottom = CAPTION_STYLE_SPECS["minimal-white-bottom"]; // anchor 0.85
  const centered = CAPTION_STYLE_SPECS["bold-yellow-centered"]; // anchor 0.5

  it("lifts a bottom caption above the lower third when one is present", () => {
    const lifted = captionSpecAboveLowerThird(bottom, true);
    expect(lifted.verticalAnchor).toBe(CAPTION_ANCHOR_ABOVE_LOWER_THIRD);
    expect(lifted.verticalAnchor).toBeLessThan(bottom.verticalAnchor);
    // Only the anchor changes — colors/weight/etc. are preserved.
    expect({ ...lifted, verticalAnchor: bottom.verticalAnchor }).toEqual(bottom);
  });

  it("leaves captions untouched when there is no lower third", () => {
    expect(captionSpecAboveLowerThird(bottom, false)).toBe(bottom);
  });

  it("never pushes a centered/high caption DOWN", () => {
    // 0.5 is already above the ceiling — returned unchanged.
    expect(captionSpecAboveLowerThird(centered, true)).toBe(centered);
  });

  it("clears the lower-third band (which starts ~0.84 of frame height)", () => {
    expect(CAPTION_ANCHOR_ABOVE_LOWER_THIRD).toBeLessThan(0.84);
  });
});
