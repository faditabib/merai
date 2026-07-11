import { describe, expect, it } from "vitest";
import {
  brandExportConfigSchema,
  buildExportPlan,
  BRAND_GRADIENT_IMAGE,
  BRAND_LOWER_THIRD_IMAGE,
  gradientOverlayConfigSchema,
  lowerThirdConfigSchema,
  type BrandExportConfig,
  type EdlV1,
  type TranscriptWord,
} from "../src/index";

function word(id: string, startMs: number, endMs: number): TranscriptWord {
  return { id, text: `كلمة-${id}`, startMs, endMs, confidence: 0.95 };
}

const words: TranscriptWord[] = [
  word("w0", 100, 400),
  word("w1", 450, 800),
  word("w2", 6000, 6400),
  word("w3", 6450, 6800),
];

const edl: EdlV1 = {
  version: 1,
  projectId: "11111111-1111-4111-8111-111111111111",
  sourceUploadId: "22222222-2222-4222-8222-222222222222",
  timeline: [
    { id: "k0", sourceInMs: 0, sourceOutMs: 1000, wordIds: ["w0", "w1"] },
    { id: "k1", sourceInMs: 5800, sourceOutMs: 7000, wordIds: ["w2", "w3"] },
  ],
  removed: [{ id: "r0", sourceInMs: 1000, sourceOutMs: 5800, reason: "silence" }],
  aspectRatio: "9:16",
  captionStyle: "minimal-white-bottom",
};

const fullBrand: BrandExportConfig = {
  gradient: { opacity: 0.6, heightPct: 0.35, color: "#000000" },
  lowerThird: {
    name: "د. أحمد",
    title: "استشاري قلب",
    accentColor: "#7C3AED",
    textColor: "#FFFFFF",
  },
};

/** Extract the -filter_complex value for a segment step. */
function filterOf(step: { args: string[] }): string {
  return step.args[step.args.indexOf("-filter_complex") + 1]!;
}

describe("brand config serialization", () => {
  it("applies documented defaults for a bare gradient", () => {
    const g = gradientOverlayConfigSchema.parse({});
    expect(g).toEqual({ opacity: 0.6, heightPct: 0.35, color: "#000000" });
  });

  it("defaults lower-third colors and requires a name", () => {
    const lt = lowerThirdConfigSchema.parse({ name: "Jane" });
    expect(lt.accentColor).toBe("#7C3AED");
    expect(lt.textColor).toBe("#FFFFFF");
    expect(lowerThirdConfigSchema.safeParse({}).success).toBe(false);
  });

  it("round-trips a full brand config through JSON (the exports.brand column)", () => {
    const roundTripped = brandExportConfigSchema.parse(
      JSON.parse(JSON.stringify(fullBrand)),
    );
    expect(roundTripped).toEqual(fullBrand);
  });

  it("rejects malformed colors and out-of-range opacity", () => {
    expect(brandExportConfigSchema.safeParse({ gradient: { color: "black" } }).success).toBe(false);
    expect(brandExportConfigSchema.safeParse({ gradient: { opacity: 2 } }).success).toBe(false);
  });

  it("accepts an empty config (all layers off)", () => {
    expect(brandExportConfigSchema.parse({})).toEqual({});
  });
});

describe("buildExportPlan brand layers", () => {
  it("unbranded plan is byte-identical whether brand is absent or null", () => {
    const absent = buildExportPlan({ edl, words });
    const explicitNull = buildExportPlan({ edl, words, brand: null });
    expect(explicitNull).toEqual(absent);
    expect(absent.brandImages).toEqual([]);
    // Regression guard: caption-only segments keep exactly one overlay.
    for (const step of absent.segments) {
      expect(filterOf(step).match(/overlay/g)).toHaveLength(1);
    }
  });

  it("composites gradient UNDER captions and lower third ON TOP (binding order)", () => {
    const plan = buildExportPlan({ edl, words, brand: fullBrand });
    expect(plan.brandImages).toEqual([BRAND_GRADIENT_IMAGE, BRAND_LOWER_THIRD_IMAGE]);

    for (const step of plan.segments) {
      const filter = filterOf(step);
      // Three overlays: gradient (input 2), captions (input 1), lower third (input 3).
      expect(filter.match(/overlay/g)).toHaveLength(3);
      const gradientAt = filter.indexOf("[2:v]overlay");
      const captionAt = filter.indexOf("[1:v]overlay");
      const lowerThirdAt = filter.indexOf("[3:v]overlay");
      expect(gradientAt).toBeGreaterThanOrEqual(0);
      expect(gradientAt).toBeLessThan(captionAt); // gradient under captions
      expect(captionAt).toBeLessThan(lowerThirdAt); // lower third on top

      // Static brand PNGs are extra inputs after input.mp4 + the caption concat.
      const joined = step.args.join(" ");
      expect(joined).toContain(`-i ${BRAND_GRADIENT_IMAGE}`);
      expect(joined).toContain(`-i ${BRAND_LOWER_THIRD_IMAGE}`);
    }
  });

  it("supports a gradient-only kit (two overlays, no lower third)", () => {
    const plan = buildExportPlan({
      edl,
      words,
      brand: { gradient: fullBrand.gradient },
    });
    expect(plan.brandImages).toEqual([BRAND_GRADIENT_IMAGE]);
    for (const step of plan.segments) {
      const filter = filterOf(step);
      expect(filter.match(/overlay/g)).toHaveLength(2);
      expect(step.args.join(" ")).not.toContain(BRAND_LOWER_THIRD_IMAGE);
    }
  });

  it("still overlays a lower third on a caption-less segment", () => {
    const noCaptions: EdlV1 = {
      ...edl,
      timeline: edl.timeline.map((s) => ({ ...s, wordIds: [] })),
    };
    const plan = buildExportPlan({
      edl: noCaptions,
      words,
      brand: { lowerThird: fullBrand.lowerThird },
    });
    expect(plan.brandImages).toEqual([BRAND_LOWER_THIRD_IMAGE]);
    for (const step of plan.segments) {
      expect(step.captionsFile).toBeNull();
      // input.mp4 (0) + lower third (1) — no caption concat input.
      expect(filterOf(step).match(/overlay/g)).toHaveLength(1);
      expect(filterOf(step)).toContain("[1:v]overlay");
    }
  });
});
