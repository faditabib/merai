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
  /** PNG filename in the ffmpeg FS. */
  file: string;
  line: CaptionLine;
  startOutMs: number;
  endOutMs: number;
}

/** One entry of the caption image sequence (caption PNG or transparent gap). */
export interface CaptionSequenceEntry {
  file: string;
  durationMs: number;
}

export interface ExportPlan {
  args: string[];
  captions: CaptionOverlayPlan[];
  /**
   * Contiguous image sequence covering 0..outputDuration: caption PNGs with
   * BLANK_IMAGE gaps. Fed to ffmpeg as ONE concat-demuxer input and applied
   * with ONE overlay — per-caption overlay filters exhaust memory on long
   * videos (139 concurrent overlays OOMed even native ffmpeg; stress test
   * 2026-07-09).
   */
  sequence: CaptionSequenceEntry[];
  /** ffconcat script describing `sequence` (written as captions.txt). */
  concatScript: string;
  width: number;
  height: number;
  outputDurationMs: number;
}

export const BLANK_IMAGE = "blank.png";

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

  const outputDurationMs = edlOutputDurationMs(edl);

  const captions: CaptionOverlayPlan[] = [];
  let cursorGuard = 0;
  buildCaptionLines(keptWords).forEach((line, index) => {
    const startOutMs = sourceToOutputMs(edl, line.startMs);
    // endMs is exclusive-ish; sample just inside so the mapping stays within
    // the segment even when the word ends exactly at a cut boundary.
    const endOutMs = sourceToOutputMs(edl, Math.max(line.startMs, line.endMs - 1));
    if (startOutMs == null || endOutMs == null || endOutMs <= startOutMs) return;
    // The sequence must be monotonic — clamp any overlap with the previous line.
    const start = Math.max(startOutMs, cursorGuard);
    if (endOutMs <= start) return;
    cursorGuard = endOutMs;
    captions.push({ file: `cap${index}.png`, line, startOutMs: start, endOutMs });
  });

  // Contiguous caption sequence: gaps filled with the transparent blank.
  // (Empty when there are no captions — no gap-only sequence.)
  const sequence: CaptionSequenceEntry[] = [];
  let cursor = 0;
  for (const caption of captions) {
    if (caption.startOutMs > cursor) {
      sequence.push({ file: BLANK_IMAGE, durationMs: caption.startOutMs - cursor });
    }
    sequence.push({ file: caption.file, durationMs: caption.endOutMs - caption.startOutMs });
    cursor = caption.endOutMs;
  }
  if (captions.length > 0 && outputDurationMs > cursor) {
    sequence.push({ file: BLANK_IMAGE, durationMs: outputDurationMs - cursor });
  }

  const concatScript =
    sequence.length > 0
      ? [
          "ffconcat version 1.0",
          ...sequence.map((entry) => `file ${entry.file}\nduration ${seconds(entry.durationMs)}`),
          // concat-demuxer quirk: the last duration only applies when a
          // trailing file entry follows it.
          `file ${BLANK_IMAGE}`,
          "",
        ].join("\n")
      : "";

  // --- filter graph -----------------------------------------------------
  // Two cut strategies (stress test 2026-07-09):
  //  * SOURCE-ORDERED timelines (the normal case) use ONE select/aselect
  //    pass — constant memory. The N-branch trim+concat graph buffers
  //    later segments' frames while earlier ones drain and OOMs on long
  //    videos (~full decoded video in RAM), even in native ffmpeg.
  //  * REORDERED timelines can't be expressed with select (it preserves
  //    decode order), so they fall back to trim+concat — fine for short
  //    videos, memory-risky for long ones (documented limitation).
  const parts: string[] = [];
  const isSourceOrdered = edl.timeline.every(
    (segment, index) =>
      index === 0 || segment.sourceInMs >= edl.timeline[index - 1]!.sourceInMs,
  );

  if (isSourceOrdered) {
    const windows = edl.timeline
      .map(
        (s) => `between(t,${seconds(s.sourceInMs)},${seconds(s.sourceOutMs)})`,
      )
      .join("+");
    // fps=30 normalizes to CFR so the frame-index PTS rebuild stays in sync
    // (VFR phone footage would drift otherwise).
    parts.push(
      `[0:v]fps=30,select='${windows}',setpts=N/FRAME_RATE/TB[vc]`,
      `[0:a]aselect='${windows}',asetpts=N/SR/TB[ac]`,
    );
  } else {
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
  }

  parts.push(
    `[vc]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}[vs]`,
  );

  const hasCaptions = captions.length > 0;
  if (hasCaptions) {
    // ONE overlay for the whole video; the sequence stream carries the
    // timing. repeatlast holds the final (blank) frame to the end.
    parts.push(`[vs][1:v]overlay=0:0[vo]`);
  }
  const finalVideo = hasCaptions ? "[vo]" : "[vs]";

  const args = [
    "-i",
    "input.mp4",
    ...(hasCaptions ? ["-f", "concat", "-safe", "0", "-i", "captions.txt"] : []),
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
    sequence,
    concatScript,
    width,
    height,
    outputDurationMs,
  };
}
