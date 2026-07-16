/**
 * Teleprompter core (Build 7.3). Pure, tested helpers — the overlay component
 * consumes these; the scroll offset derives from the RECORDER SESSION's
 * elapsed time (pause-excluding, Build 7.1), never wall clock, so pausing a
 * take freezes the script exactly where the creator stopped.
 */

export type PrompterMode = "off" | "notes" | "prompter";

export const PROMPTER_MODES: readonly PrompterMode[] = ["off", "notes", "prompter"];

export const SCRIPT_MAX_CHARS = 20_000;
export const SCRIPT_STORAGE_KEY = "merai.record.script";

export const SPEED_MIN = 10;
export const SPEED_MAX = 120;
export const SPEED_DEFAULT = 40;

export const FONT_MIN = 18;
export const FONT_MAX = 48;
export const FONT_DEFAULT = 28;

export const COUNTDOWN_OPTIONS = [3, 5, 10] as const;
export const COUNTDOWN_DEFAULT = 3;

export function clampScrollSpeed(pxPerSec: number): number {
  if (!Number.isFinite(pxPerSec)) return SPEED_DEFAULT;
  return Math.min(SPEED_MAX, Math.max(SPEED_MIN, pxPerSec));
}

export function clampFontPx(px: number): number {
  if (!Number.isFinite(px)) return FONT_DEFAULT;
  return Math.min(FONT_MAX, Math.max(FONT_MIN, px));
}

export function clampCountdown(seconds: number): number {
  return (COUNTDOWN_OPTIONS as readonly number[]).includes(seconds)
    ? seconds
    : COUNTDOWN_DEFAULT;
}

/** Scroll offset in px for a given session-elapsed time. */
export function scrollOffsetPx(elapsedMs: number, pxPerSec: number): number {
  if (elapsedMs <= 0) return 0;
  return (elapsedMs / 1000) * clampScrollSpeed(pxPerSec);
}

/**
 * Reading-time estimate from a whitespace word count — script-agnostic
 * (Arabic and Latin both space-delimit). 140 wpm is a comfortable
 * speaking pace.
 */
export function estimateReadingSeconds(text: string, wpm = 140): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  if (words === 0) return 0;
  return Math.round((words / wpm) * 60);
}
