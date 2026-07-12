import { describe, expect, it } from "vitest";
import {
  activeCaptionIndex,
  activeWordIndex,
  buildCaptionLines,
  captionConfigForExport,
  captionStyleSpecSchema,
  CAPTION_BREAK_GAP_MS,
  CAPTION_MAX_LINE_CHARS,
  CAPTION_STYLE_SPECS,
  CAPTION_STYLE_TOKENS,
  hexToRgba,
  type TranscriptWord,
} from "../src/index";

function word(
  id: string,
  text: string,
  startMs: number,
  endMs: number,
): TranscriptWord {
  return { id, text, startMs, endMs, confidence: 0.95 };
}

describe("buildCaptionLines (timing-gap based — Phase 2 decision)", () => {
  it("breaks on inter-word gaps, NOT relying on punctuation", () => {
    // Arabic-style input: zero punctuation, one long pause.
    const words = [
      word("w0", "السلام", 0, 400),
      word("w1", "عليكم", 450, 800),
      word("w2", "اليوم", 800 + CAPTION_BREAK_GAP_MS + 200, 2000), // long gap
      word("w3", "نبدأ", 2050, 2400),
    ];
    const lines = buildCaptionLines(words);
    expect(lines).toHaveLength(2);
    expect(lines[0]!.text).toBe("السلام عليكم");
    expect(lines[1]!.text).toBe("اليوم نبدأ");
    expect(lines[0]!.endMs).toBe(800);
    expect(lines[1]!.startMs).toBe(800 + CAPTION_BREAK_GAP_MS + 200);
  });

  it("caps line length in characters", () => {
    const long = "كلمةطويلةجدا"; // 12 chars
    const words = Array.from({ length: 8 }, (_, i) =>
      word(`w${i}`, long, i * 500, i * 500 + 400),
    );
    const lines = buildCaptionLines(words);
    for (const line of lines) {
      expect(line.text.length).toBeLessThanOrEqual(CAPTION_MAX_LINE_CHARS + long.length);
    }
    expect(lines.length).toBeGreaterThan(1);
  });

  it("uses sentence punctuation as a secondary break when present", () => {
    const words = [
      word("w0", "Hello.", 0, 300),
      word("w1", "World", 350, 700), // small gap, but previous ends a sentence
    ];
    const lines = buildCaptionLines(words);
    expect(lines).toHaveLength(2);
  });

  it("handles Arabic question mark ؟ as sentence end", () => {
    const words = [
      word("w0", "تلقائي؟", 0, 400),
      word("w1", "نعم", 450, 700),
    ];
    expect(buildCaptionLines(words)).toHaveLength(2);
  });
});

describe("caption studio presets & brand resolution (Build 6B.2)", () => {
  it("every token has a spec, and each spec validates against the schema", () => {
    for (const token of CAPTION_STYLE_TOKENS) {
      const spec = CAPTION_STYLE_SPECS[token];
      expect(spec).toBeDefined();
      expect(spec.token).toBe(token);
      // The built-in specs must be valid snapshot payloads.
      expect(captionStyleSpecSchema.safeParse(spec).success).toBe(true);
    }
  });

  it("returns null for a preset that needs no runtime brand data (token path)", () => {
    expect(captionConfigForExport("minimal-white-bottom", { primary: "#7C3AED", accent: "#F59E0B" })).toBeNull();
    // Brand-color preset but NO brand → still null (falls back to the token spec).
    expect(captionConfigForExport("brand-box", null)).toBeNull();
  });

  it("resolves the brand color into the box for brand-box", () => {
    const cfg = captionConfigForExport("brand-box", { primary: "#7C3AED", accent: "#F59E0B" });
    expect(cfg).not.toBeNull();
    expect(cfg!.backgroundColor).toBe(hexToRgba("#7C3AED", 0.85));
    expect(cfg!.token).toBe("brand-box");
    expect(captionStyleSpecSchema.safeParse(cfg).success).toBe(true);
  });

  it("resolves the accent color into the text for brand-accent", () => {
    const cfg = captionConfigForExport("brand-accent", { primary: "#7C3AED", accent: "#F59E0B" });
    expect(cfg!.textColor).toBe("#F59E0B");
    expect(cfg!.useBrandColor).toBe("text");
  });

  it("clamps a hostile fontScale out of the schema's safe band", () => {
    expect(captionStyleSpecSchema.safeParse({
      ...CAPTION_STYLE_SPECS["bold-impact"], fontScale: 9,
    }).success).toBe(false);
  });

  it("unknown token falls back to the default spec, no throw", () => {
    expect(captionConfigForExport("does-not-exist", { primary: "#000000", accent: "#ffffff" })).toBeNull();
  });
});

describe("caption playback lookups", () => {
  const lines = buildCaptionLines([
    word("w0", "ابدأ", 100, 400),
    word("w1", "الآن", 450, 800),
    word("w2", "توقف", 2000, 2400),
  ]);

  it("finds the active line and word for a source time", () => {
    expect(activeCaptionIndex(lines, 500)).toBe(0);
    expect(activeCaptionIndex(lines, 1500)).toBe(-1); // between lines
    expect(activeCaptionIndex(lines, 2100)).toBe(1);

    expect(activeWordIndex(lines[0]!, 200)).toBe(0);
    expect(activeWordIndex(lines[0]!, 600)).toBe(1);
    expect(activeWordIndex(lines[0]!, 420)).toBe(-1); // in the inter-word gap
  });
});
