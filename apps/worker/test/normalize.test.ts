import { describe, expect, it } from "vitest";
import { MAX_RAW_UPLOAD_SECONDS } from "@merai/core";
import { arabicFixture } from "../src/transcription/fixtures/arabic";
import { englishFixture } from "../src/transcription/fixtures/english";
import { assemblyAiToResult } from "../src/transcription/normalize";

describe("assemblyAiToResult", () => {
  it("normalizes the Arabic fixture into sequential word ids with ms timestamps", () => {
    const result = assemblyAiToResult(arabicFixture);

    expect(result.providerTranscriptId).toBe("mock-transcript-ar-001");
    expect(result.languageCode).toBe("ar");
    expect(result.words.length).toBe(arabicFixture.words!.length);
    expect(result.words[0]).toMatchObject({ id: "w0", text: "السلام" });
    expect(result.words.at(-1)!.id).toBe(`w${result.words.length - 1}`);

    // Timestamps are strictly ordered and non-overlapping.
    for (let i = 1; i < result.words.length; i++) {
      expect(result.words[i]!.startMs).toBeGreaterThanOrEqual(
        result.words[i - 1]!.endMs,
      );
    }
  });

  it("keeps filler words and take gaps intact for Phase 2 analysis", () => {
    const result = assemblyAiToResult(arabicFixture);
    const texts = result.words.map((w) => w.text);
    expect(texts).toContain("يعني");
    expect(texts).toContain("اه");

    // The re-record gap (>2s) between takes must be visible in timing data.
    const gaps = result.words
      .slice(1)
      .map((w, i) => w.startMs - result.words[i]!.endMs);
    expect(Math.max(...gaps)).toBeGreaterThanOrEqual(2000);
  });

  it("normalizes the English fixture with disfluencies present", () => {
    const result = assemblyAiToResult(englishFixture);
    expect(result.languageCode).toBe("en_us");
    const texts = result.words.map((w) => w.text);
    expect(texts).toContain("um");
    expect(texts).toContain("uh");
  });

  it("both fixtures stay under the product duration cap", () => {
    for (const fixture of [arabicFixture, englishFixture]) {
      expect(fixture.audio_duration).toBeGreaterThan(0);
      expect(fixture.audio_duration!).toBeLessThanOrEqual(MAX_RAW_UPLOAD_SECONDS);
    }
  });

  it("refuses to normalize a non-completed transcript", () => {
    expect(() =>
      assemblyAiToResult({ ...arabicFixture, status: "error", error: "boom" }),
    ).toThrow(/error/);
  });
});
