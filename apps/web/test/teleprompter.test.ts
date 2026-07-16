import { describe, expect, it } from "vitest";
import {
  clampCountdown,
  clampFontPx,
  clampScrollSpeed,
  COUNTDOWN_DEFAULT,
  estimateReadingSeconds,
  FONT_DEFAULT,
  PROMPTER_MODES,
  scrollOffsetPx,
  SPEED_DEFAULT,
  SPEED_MAX,
  SPEED_MIN,
} from "../src/lib/record/teleprompter";

describe("teleprompter core (Build 7.3)", () => {
  it("declares the three prompter modes", () => {
    expect(PROMPTER_MODES).toEqual(["off", "notes", "prompter"]);
  });

  it("scrollOffsetPx is linear in session elapsed time", () => {
    expect(scrollOffsetPx(0, 40)).toBe(0);
    expect(scrollOffsetPx(1000, 40)).toBe(40);
    expect(scrollOffsetPx(2500, 40)).toBe(100);
    // Negative elapsed (clock skew) never scrolls backwards past the top.
    expect(scrollOffsetPx(-500, 40)).toBe(0);
  });

  it("scrollOffsetPx clamps the speed like the slider does", () => {
    expect(scrollOffsetPx(1000, 999)).toBe(SPEED_MAX);
    expect(scrollOffsetPx(1000, 1)).toBe(SPEED_MIN);
  });

  it("clamps: speed / font / countdown, with garbage fallbacks", () => {
    expect(clampScrollSpeed(40)).toBe(40);
    expect(clampScrollSpeed(NaN)).toBe(SPEED_DEFAULT);
    expect(clampFontPx(28)).toBe(28);
    expect(clampFontPx(500)).toBe(48);
    expect(clampFontPx(NaN)).toBe(FONT_DEFAULT);
    expect(clampCountdown(5)).toBe(5);
    expect(clampCountdown(7)).toBe(COUNTDOWN_DEFAULT);
  });

  it("estimateReadingSeconds counts Arabic and Latin words alike", () => {
    expect(estimateReadingSeconds("")).toBe(0);
    expect(estimateReadingSeconds("   ")).toBe(0);
    // 140 words at 140wpm = 60s.
    expect(estimateReadingSeconds(Array(140).fill("كلمة").join(" "))).toBe(60);
    expect(estimateReadingSeconds(Array(70).fill("word").join(" "))).toBe(30);
    // Mixed whitespace/newlines.
    expect(estimateReadingSeconds("مرحبا  بكم\nفي ميراي")).toBe(
      Math.round((4 / 140) * 60),
    );
  });
});
