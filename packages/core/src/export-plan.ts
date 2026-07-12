import {
  BRAND_GRADIENT_IMAGE,
  BRAND_LOGO_IMAGE,
  BRAND_LOWER_THIRD_IMAGE,
  type BrandExportConfig,
} from "./brand";
import { buildCaptionLines, type CaptionLine } from "./captions";
import { edlOutputDurationMs, type AspectRatio, type EdlV1 } from "./edl";
import { sourceToOutputMs } from "./edl-ops";
import type { TranscriptWord } from "./transcript";

/**
 * Pure export planning: EDL → a SEGMENT-WISE render plan.
 * No ffmpeg or DOM access here — fully unit-testable.
 *
 * Why segment-wise (stress test, 2026-07-09): single-command filter graphs
 * over a ~10-minute source ran out of memory even in NATIVE ffmpeg — first
 * with 139 per-caption overlays, then with N-branch trim+concat, then with a
 * single-pass select graph. Rendering each kept segment as its own small
 * ffmpeg run (input-seeked, so only that window is decoded) bounds peak
 * memory to one segment regardless of total duration; the final join of the
 * identically-encoded parts is a -c copy remux (no re-encode, no quality
 * loss, negligible memory). Frames are still encoded exactly once.
 *
 * Captions arrive as pre-rendered transparent PNGs (Arabic shaping happens
 * in the browser canvas, never in ffmpeg). Each segment overlays ONE
 * concat-demuxer image sequence (caption PNGs + blank gaps) clipped to its
 * own output window; a caption line spanning a cut simply appears in both
 * adjacent segments.
 */

/** 720-class outputs: wasm encode speed over pixels (margin decision). */
export const EXPORT_RESOLUTIONS: Record<
  AspectRatio,
  { width: number; height: number }
> = {
  "9:16": { width: 720, height: 1280 },
  "1:1": { width: 720, height: 720 },
  "16:9": { width: 1280, height: 720 },
};

export const BLANK_IMAGE = "blank.png";

export interface CaptionOverlayPlan {
  /** PNG filename in the ffmpeg FS. */
  file: string;
  line: CaptionLine;
  startOutMs: number;
  endOutMs: number;
}

/** One entry of a caption image sequence (caption PNG or transparent gap). */
export interface CaptionSequenceEntry {
  file: string;
  durationMs: number;
}

/** One per-segment ffmpeg invocation. */
export interface SegmentRenderStep {
  index: number;
  args: string[];
  outputFile: string;
  /** ffconcat script for this segment's caption sequence (null = no captions). */
  captionsScript: string | null;
  captionsFile: string | null;
  durationMs: number;
}

export interface ExportPlan {
  segments: SegmentRenderStep[];
  /** Final -c copy remux joining the segment files. */
  joinArgs: string[];
  joinFile: string;
  joinScript: string;
  /** All caption lines (global output-time windows) for rasterization. */
  captions: CaptionOverlayPlan[];
  /**
   * Brand layer PNGs (Build 6B.1) the worker must rasterize and stage
   * alongside caption images. Empty array = unbranded export, and every
   * segment's args are byte-identical to pre-6B.1 plans.
   */
  brandImages: string[];
  width: number;
  height: number;
  outputDurationMs: number;
}

const seconds = (ms: number) => (ms / 1000).toFixed(3);

const ENCODE_ARGS = [
  "-c:v",
  "libx264",
  "-preset",
  "veryfast",
  "-crf",
  "23",
  "-pix_fmt",
  "yuv420p",
  "-c:a",
  "aac",
  "-b:a",
  "128k",
];

function ffconcatScript(sequence: CaptionSequenceEntry[]): string {
  return [
    "ffconcat version 1.0",
    ...sequence.map((entry) => `file ${entry.file}\nduration ${seconds(entry.durationMs)}`),
    // concat-demuxer quirk: the last duration only applies when a trailing
    // file entry follows it.
    `file ${BLANK_IMAGE}`,
    "",
  ].join("\n");
}

export function buildExportPlan(input: {
  edl: EdlV1;
  words: TranscriptWord[];
  /** Optional creator branding (exports.brand snapshot); absent = legacy plan. */
  brand?: BrandExportConfig | null;
}): ExportPlan {
  const { edl, words, brand } = input;
  const { width, height } = EXPORT_RESOLUTIONS[edl.aspectRatio];
  const outputDurationMs = edlOutputDurationMs(edl);

  // --- caption lines from kept words, windows in OUTPUT time --------------
  const wordById = new Map(words.map((w) => [w.id, w]));
  const keptWords: TranscriptWord[] = [];
  for (const segment of edl.timeline) {
    for (const id of segment.wordIds ?? []) {
      const word = wordById.get(id);
      if (word) keptWords.push(word);
    }
  }

  const captions: CaptionOverlayPlan[] = [];
  let cursorGuard = 0;
  buildCaptionLines(keptWords).forEach((line, index) => {
    const startOutMs = sourceToOutputMs(edl, line.startMs);
    // endMs is exclusive-ish; sample just inside so the mapping stays within
    // the segment even when the word ends exactly at a cut boundary.
    const endOutMs = sourceToOutputMs(edl, Math.max(line.startMs, line.endMs - 1));
    if (startOutMs == null || endOutMs == null || endOutMs <= startOutMs) return;
    // Windows must be monotonic — clamp any overlap with the previous line.
    const start = Math.max(startOutMs, cursorGuard);
    if (endOutMs <= start) return;
    cursorGuard = endOutMs;
    captions.push({ file: `cap${index}.png`, line, startOutMs: start, endOutMs });
  });

  // --- brand layers: static full-frame PNGs overlaid in every segment ------
  // Canonical z-order (Build 6C.3): video → gradient → lower third → captions
  // → logo. Captions are the highest READABILITY layer (lifted clear of the
  // lower-third band); the logo/watermark sits on top for branding.
  const gradientImage = brand?.gradient ? BRAND_GRADIENT_IMAGE : null;
  const lowerThirdImage = brand?.lowerThird ? BRAND_LOWER_THIRD_IMAGE : null;
  const logoImage = brand?.logo ? BRAND_LOGO_IMAGE : null;
  const brandImages = [gradientImage, lowerThirdImage, logoImage].filter(
    (f): f is string => f !== null,
  );

  // --- one small ffmpeg run per kept segment ------------------------------
  const scaleCrop = `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`;
  const segments: SegmentRenderStep[] = [];
  let outCursor = 0;

  edl.timeline.forEach((segment, index) => {
    const durationMs = segment.sourceOutMs - segment.sourceInMs;
    const segStartOutMs = outCursor;
    const segEndOutMs = outCursor + durationMs;
    outCursor = segEndOutMs;

    // Captions overlapping this segment, clipped to segment-local time
    // (output timestamps restart at 0 after the input seek).
    const sequence: CaptionSequenceEntry[] = [];
    let cursor = 0;
    for (const caption of captions) {
      if (caption.endOutMs <= segStartOutMs || caption.startOutMs >= segEndOutMs) {
        continue;
      }
      const localStart = Math.max(0, caption.startOutMs - segStartOutMs);
      const localEnd = Math.min(durationMs, caption.endOutMs - segStartOutMs);
      if (localEnd <= localStart) continue;
      if (localStart > cursor) {
        sequence.push({ file: BLANK_IMAGE, durationMs: localStart - cursor });
      }
      sequence.push({ file: caption.file, durationMs: localEnd - localStart });
      cursor = localEnd;
    }
    if (sequence.length > 0 && durationMs > cursor) {
      sequence.push({ file: BLANK_IMAGE, durationMs: durationMs - cursor });
    }

    const hasCaptions = sequence.length > 0;
    const captionsFile = hasCaptions ? `captions-seg${index}.txt` : null;

    // Inputs after input.mp4 (index 0), in order: caption concat sequence,
    // then static brand PNGs (a single-frame image input persists across the
    // segment — overlay's default repeatlast holds the last frame).
    const inputArgs: string[] = [];
    let nextInput = 1;
    let captionsInput = -1;
    let gradientInput = -1;
    let lowerThirdInput = -1;
    let logoInput = -1;
    if (hasCaptions) {
      inputArgs.push("-f", "concat", "-safe", "0", "-i", captionsFile!);
      captionsInput = nextInput++;
    }
    if (gradientImage) {
      inputArgs.push("-i", gradientImage);
      gradientInput = nextInput++;
    }
    if (lowerThirdImage) {
      inputArgs.push("-i", lowerThirdImage);
      lowerThirdInput = nextInput++;
    }
    if (logoImage) {
      inputArgs.push("-i", logoImage);
      logoInput = nextInput++;
    }

    // Chain overlays in canonical z-order (each a full-frame PNG at 0:0):
    // gradient → lower third → captions → logo.
    const stages: string[] = [`[0:v]${scaleCrop}[vs]`];
    let label = "[vs]";
    let stage = 0;
    const overlayOnto = (inputIndex: number, out: string) => {
      stages.push(`${label}[${inputIndex}:v]overlay=0:0${out}`);
      label = out;
    };
    if (gradientInput !== -1) overlayOnto(gradientInput, `[vb${stage++}]`);
    if (lowerThirdInput !== -1) overlayOnto(lowerThirdInput, `[vb${stage++}]`);
    if (captionsInput !== -1) overlayOnto(captionsInput, "[vo]");
    if (logoInput !== -1) overlayOnto(logoInput, `[vb${stage++}]`);

    segments.push({
      index,
      args: [
        // Input seeking: only this window is demuxed/decoded — the memory
        // and time bound that makes long videos viable in wasm.
        "-ss",
        seconds(segment.sourceInMs),
        "-t",
        seconds(durationMs),
        "-i",
        "input.mp4",
        ...inputArgs,
        "-filter_complex",
        stages.join(";"),
        "-map",
        label,
        "-map",
        "0:a",
        ...ENCODE_ARGS,
        `seg${index}.mp4`,
      ],
      outputFile: `seg${index}.mp4`,
      captionsScript: hasCaptions ? ffconcatScript(sequence) : null,
      captionsFile,
      durationMs,
    });
  });

  // --- final join: pure remux, no re-encode -------------------------------
  const joinScript =
    ["ffconcat version 1.0", ...segments.map((s) => `file ${s.outputFile}`), ""].join(
      "\n",
    );
  const joinArgs = [
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    "join.txt",
    "-c",
    "copy",
    "-movflags",
    "+faststart",
    "out.mp4",
  ];

  return {
    segments,
    joinArgs,
    joinFile: "join.txt",
    joinScript,
    captions,
    brandImages,
    width,
    height,
    outputDurationMs,
  };
}
