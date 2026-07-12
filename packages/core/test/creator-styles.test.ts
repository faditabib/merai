import { describe, expect, it } from "vitest";
import {
  aspectRatioSchema,
  captionStyleSpecSchema,
  creatorStyleBrandKitPatch,
  getCreatorStyle,
  gradientOverlayConfigSchema,
  hexColorSchema,
  CREATOR_STYLES,
  CREATOR_STYLE_IDS,
} from "../src/index";

describe("Creator Styles catalog (Build 6C.2)", () => {
  it("has 6 styles, each fully valid against the existing schemas", () => {
    expect(CREATOR_STYLES).toHaveLength(6);
    expect(CREATOR_STYLES.map((s) => s.id)).toEqual([...CREATOR_STYLE_IDS]);
    for (const style of CREATOR_STYLES) {
      expect(captionStyleSpecSchema.safeParse(style.caption).success, style.id).toBe(true);
      for (const c of Object.values(style.colors)) {
        expect(hexColorSchema.safeParse(c).success, `${style.id} ${c}`).toBe(true);
      }
      expect(hexColorSchema.safeParse(style.lowerThird.accentColor).success).toBe(true);
      expect(hexColorSchema.safeParse(style.lowerThird.textColor).success).toBe(true);
      if (style.overlay) {
        expect(gradientOverlayConfigSchema.safeParse(style.overlay).success, style.id).toBe(true);
      }
      expect(aspectRatioSchema.safeParse(style.aspectRatio).success).toBe(true);
      expect(style.useCaseKey.length).toBeGreaterThan(0);
    }
  });

  it("getCreatorStyle resolves ids and rejects unknowns", () => {
    expect(getCreatorStyle("founder-bold")?.id).toBe("founder-bold");
    expect(getCreatorStyle("nope")).toBeUndefined();
  });

  // PRD house rule: real creators' names are internal references only and must
  // never ship. Guard ids in CI (labels live in i18n, kept generic by hand).
  it("carries NO real creator names in ids", () => {
    const blocklist = ["hormozi", "garyvee", "gary vee", "vaynerchuk", "abdaal", "gadzhi"];
    for (const id of CREATOR_STYLE_IDS) {
      const lower = id.toLowerCase();
      for (const name of blocklist) expect(lower.includes(name), id).toBe(false);
    }
  });
});

describe("creatorStyleBrandKitPatch (overwrite look, preserve identity)", () => {
  const style = getCreatorStyle("founder-bold")!;

  it("writes the style's look fields", () => {
    const patch = creatorStyleBrandKitPatch(style, null);
    expect(patch.primary_color).toBe(style.colors.primary);
    expect(patch.accent_color).toBe(style.colors.accent);
    expect(patch.caption_style_default).toBe(style.caption.token);
    expect(patch.caption_default_config).toEqual(style.caption);
    expect(patch.overlay_default).toEqual(style.overlay);
    expect(patch.lower_third_default.accentColor).toBe(style.lowerThird.accentColor);
  });

  it("preserves an existing lower-third name/title (identity kept)", () => {
    const patch = creatorStyleBrandKitPatch(style, {
      lower_third_default: { name: "د. أحمد", title: "استشاري قلب", accentColor: "#000000", textColor: "#000000" },
    });
    expect(patch.lower_third_default.name).toBe("د. أحمد");
    expect(patch.lower_third_default.title).toBe("استشاري قلب");
    // But the colors restyle to the new style.
    expect(patch.lower_third_default.accentColor).toBe(style.lowerThird.accentColor);
  });

  it("defaults an empty name when there's no existing lower third", () => {
    const patch = creatorStyleBrandKitPatch(style, null);
    expect(patch.lower_third_default.name).toBe("");
    expect(patch.lower_third_default.title).toBeUndefined();
  });
});
