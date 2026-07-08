import {
  edlV1Schema,
  SEGMENT_PAD_MS,
  SILENCE_MIN_GAP_MS,
  type AspectRatio,
  type EdlV1,
  type KeptSegment,
  type RemovalReason,
  type RemovedSegment,
  type TranscriptWord,
} from "@merai/core";
import { log } from "../logger";
import type { AnalysisResult, WordRange } from "../analysis/types";

/**
 * Turn a transcript + analysis into the first-draft EDL (v1, single-track).
 *
 * Model: `timeline` = ordered kept segments whose concatenation is the output
 * video; `removed` = explainable, restorable annotations (fillers, false
 * starts, weaker takes, silence). Any source time not covered by a kept
 * segment is cut. SEGMENT_PAD_MS of breathing room is preserved around kept
 * speech; interior gaps > SILENCE_MIN_GAP_MS become silence cuts.
 *
 * Defensive by design: analysis engines may reference unknown/inverted word
 * ranges (AI output) — those are skipped with a warning, never crash the job.
 */

export interface BuildEdlInput {
  projectId: string;
  sourceUploadId: string;
  words: TranscriptWord[];
  analysis: AnalysisResult;
  aspectRatio: AspectRatio;
  captionStyle: string;
  /** Media duration when known — enables trailing-silence removal. */
  totalDurationMs?: number | null;
}

interface WordRemoval {
  reason: RemovalReason;
  note?: string;
}

export function buildEdl(input: BuildEdlInput): EdlV1 {
  const { words } = input;
  const indexById = new Map(words.map((word, index) => [word.id, index]));

  // --- Resolve analysis into per-word removals -----------------------------
  // Later applications win: filler < false-start < bad-take.
  const removals: (WordRemoval | undefined)[] = new Array(words.length);

  const markRange = (range: WordRange, removal: WordRemoval) => {
    const start = indexById.get(range.startWordId);
    const end = indexById.get(range.endWordId);
    if (start === undefined || end === undefined || start > end) {
      log.warn(
        `buildEdl: skipping invalid ${removal.reason} range ${range.startWordId}..${range.endWordId}`,
      );
      return;
    }
    for (let i = start; i <= end; i++) removals[i] = removal;
  };

  for (const filler of input.analysis.fillers) {
    for (const wordId of filler.wordIds) {
      const index = indexById.get(wordId);
      if (index === undefined) {
        log.warn(`buildEdl: skipping unknown filler word id ${wordId}`);
        continue;
      }
      removals[index] = { reason: "filler", note: filler.note };
    }
  }
  for (const falseStart of input.analysis.falseStarts) {
    markRange(falseStart, { reason: "false-start", note: falseStart.note });
  }
  for (const retake of input.analysis.retakes) {
    if (retake.keepIndex >= retake.takes.length) {
      log.warn(`buildEdl: retake keepIndex ${retake.keepIndex} out of range — keeping last take`);
    }
    const keep = Math.min(retake.keepIndex, retake.takes.length - 1);
    retake.takes.forEach((take, index) => {
      if (index === keep) return;
      markRange(take, { reason: "bad-take", note: retake.note });
    });
  }

  // --- Walk words into kept/removed runs -----------------------------------
  const timeline: KeptSegment[] = [];
  const removed: RemovedSegment[] = [];
  let keptSegmentCount = 0;
  let removedSegmentCount = 0;

  const pushKept = (run: TranscriptWord[]) => {
    const first = run[0]!;
    const last = run[run.length - 1]!;
    timeline.push({
      id: `seg-k${keptSegmentCount++}`,
      sourceInMs: Math.max(0, first.startMs - SEGMENT_PAD_MS),
      sourceOutMs: last.endMs + SEGMENT_PAD_MS,
      wordIds: run.map((w) => w.id),
    });
  };

  const pushRemovedWords = (run: TranscriptWord[], removal: WordRemoval) => {
    const first = run[0]!;
    const last = run[run.length - 1]!;
    removed.push({
      id: `seg-r${removedSegmentCount++}`,
      sourceInMs: first.startMs,
      sourceOutMs: last.endMs,
      wordIds: run.map((w) => w.id),
      reason: removal.reason,
      ...(removal.note ? { note: removal.note } : {}),
    });
  };

  const pushSilence = (fromMs: number, toMs: number) => {
    if (toMs <= fromMs) return;
    removed.push({
      id: `seg-r${removedSegmentCount++}`,
      sourceInMs: fromMs,
      sourceOutMs: toMs,
      reason: "silence",
    });
  };

  // Leading silence.
  const firstWord = words[0];
  if (firstWord && firstWord.startMs > SILENCE_MIN_GAP_MS) {
    pushSilence(0, Math.max(0, firstWord.startMs - SEGMENT_PAD_MS));
  }

  let keptRun: TranscriptWord[] = [];
  let removedRun: TranscriptWord[] = [];
  let removedRunReason: WordRemoval | null = null;

  const flushKept = () => {
    if (keptRun.length > 0) pushKept(keptRun);
    keptRun = [];
  };
  const flushRemoved = () => {
    if (removedRun.length > 0 && removedRunReason) {
      pushRemovedWords(removedRun, removedRunReason);
    }
    removedRun = [];
    removedRunReason = null;
  };

  words.forEach((word, index) => {
    const removal = removals[index];
    const previous = index > 0 ? words[index - 1]! : null;
    const gap = previous ? word.startMs - previous.endMs : 0;

    if (removal) {
      flushKept();
      // Split removed runs when the reason changes so annotations stay precise.
      if (removedRunReason && removedRunReason.reason !== removal.reason) {
        flushRemoved();
      }
      removedRunReason = removal;
      removedRun.push(word);
      return;
    }

    // Kept word: an interior long gap ends the current kept segment and is
    // recorded as removable silence (only between two kept words — gaps
    // around removed material are already covered by the removed segment).
    if (
      previous &&
      gap > SILENCE_MIN_GAP_MS &&
      keptRun.length > 0 &&
      removedRun.length === 0
    ) {
      flushKept();
      pushSilence(previous.endMs + SEGMENT_PAD_MS, word.startMs - SEGMENT_PAD_MS);
    }
    flushRemoved();
    keptRun.push(word);
  });
  flushKept();
  flushRemoved();

  // Trailing silence.
  const lastWord = words[words.length - 1];
  if (
    lastWord &&
    input.totalDurationMs != null &&
    input.totalDurationMs - lastWord.endMs > SILENCE_MIN_GAP_MS
  ) {
    pushSilence(lastWord.endMs + SEGMENT_PAD_MS, input.totalDurationMs);
  }

  // --- Resolve pad overlaps between adjacent kept segments -----------------
  for (let i = 1; i < timeline.length; i++) {
    const previous = timeline[i - 1]!;
    const current = timeline[i]!;
    if (current.sourceInMs < previous.sourceOutMs) {
      const mid = Math.round((previous.sourceOutMs + current.sourceInMs) / 2);
      previous.sourceOutMs = mid;
      current.sourceInMs = mid;
    }
  }

  const edl: EdlV1 = {
    version: 1,
    projectId: input.projectId,
    sourceUploadId: input.sourceUploadId,
    timeline,
    removed,
    aspectRatio: input.aspectRatio,
    captionStyle: input.captionStyle,
  };

  // Guarantee we never persist a malformed EDL.
  return edlV1Schema.parse(edl);
}
