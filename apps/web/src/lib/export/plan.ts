import {
  buildCaptionLines,
  sourceToOutputMs,
  edlOutputDurationMs,
  type AspectRatio,
  type CaptionLine,
  type EdlV1,
  type TranscriptWord,
} from "@merai/core";

/**
 * Pure export planning: EDL → ffmpeg args + caption overlay windows.
 * No ffmpeg or DOM access here — fully unit-testable.
 *
 * Cut model: one-pass filter_complex trim/atrim + concat per kept segment
 * (frame-accurate re-encode — the authoritative render the preview only
 * approximates). Captions arrive as pre-rendered transparent PNGs (Arabic
 * shaping happens in the browser canvas, never in ffmpeg) overlaid with
 * enable='between(t,…)' windows computed in OUTPUT time.
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

export interface CaptionOverlayPlan {
  /** PNG filename in the ffmpeg FS (also the -i order after input.mp4). */
  file: string;
  line: CaptionLine;
  startOutMs: number;
  endOutMs: number;
}

export interface ExportPlan {
  args: string[];
  captions: CaptionOverlayPlan[];
  width: number;
  height: number;
  outputDurationMs: number;
}

const seconds = (ms: number) => (ms / 1000).toFixed(3);

export function buildExportPlan(input: {
  edl: EdlV1;
  words: TranscriptWord[];
}): ExportPlan {
  const { edl, words } = input;
  const { width, height } = EXPORT_RESOLUTIONS[edl.aspectRatio];

  // Caption lines from kept words, in output (timeline) order.
  const wordById = new Map(words.map((w) => [w.id, w]));
  const keptWords: TranscriptWord[] = [];
  for (const segment of edl.timeline) {
    for (const id of segment.wordIds ?? []) {
      const word = wordById.get(id);
      if (word) keptWords.push(word);
    }
  }

  const captions: CaptionOverlayPlan[] = [];
  buildCaptionLines(keptWords).forEach((line, index) => {
    const startOutMs = sourceToOutputMs(edl, line.startMs);
    // endMs is exclusive-ish; sample just inside so the mapping stays within
    // the segment even when the word ends exactly at a cut boundary.
    const endOutMs = sourceToOutputMs(edl, Math.max(line.startMs, line.endMs - 1));
    if (startOutMs == null || endOutMs == null || endOutMs <= startOutMs) return;
    captions.push({ file: `cap${index}.png`, line, startOutMs, endOutMs });
  });

  // --- filter graph -----------------------------------------------------
  const parts: string[] = [];
  edl.timeline.forEach((segment, index) => {
    const from = seconds(segment.sourceInMs);
    const to = seconds(segment.sourceOutMs);
    parts.push(
      `[0:v]trim=start=${from}:end=${to},setpts=PTS-STARTPTS[v${index}]`,
      `[0:a]atrim=start=${from}:end=${to},asetpts=PTS-STARTPTS[a${index}]`,
    );
  });
  const concatInputs = edl.timeline.map((_, i) => `[v${i}][a${i}]`).join("");
  parts.push(`${concatInputs}concat=n=${edl.timeline.length}:v=1:a=1[vc][ac]`);
  parts.push(
    `[vc]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}[base0]`,
  );

  captions.forEach((caption, index) => {
    parts.push(
      `[base${index}][${index + 1}:v]overlay=0:0:enable='between(t,${seconds(caption.startOutMs)},${seconds(caption.endOutMs)})'[base${index + 1}]`,
    );
  });
  const finalVideo = `[base${captions.length}]`;

  const args = [
    "-i",
    "input.mp4",
    ...captions.flatMap((caption) => ["-i", caption.file]),
    "-filter_complex",
    parts.join(";"),
    "-map",
    finalVideo,
    "-map",
    "[ac]",
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
    "-movflags",
    "+faststart",
    "out.mp4",
  ];

  return {
    args,
    captions,
    width,
    height,
    outputDurationMs: edlOutputDurationMs(edl),
  };
}
