import {
  edlV1Schema,
  type EdlV1,
  type KeptSegment,
  type RemovedSegment,
} from "./edl";
import type { TranscriptWord } from "./transcript";

/**
 * Pure EDL editing operations — the editor's entire mutation surface.
 * Every operation is EdlV1 → EdlV1 (validated on the way out), so undo/redo
 * is a snapshot stack and saving is appending an immutable version.
 *
 * Conventions:
 *  - Word-level edits translate to segment transforms using word timings;
 *    boundaries between a removed word and a kept neighbor land at the
 *    midpoint of the inter-word gap (no orphaned slivers, no overlaps).
 *  - restoreRemoved re-inserts by source time relative to neighbors. If the
 *    user reordered segments, insertion falls back to source-order position
 *    among current timeline entries (documented MVP behavior).
 */

const MIN_SEGMENT_MS = 100;

function nextSegmentId(edl: EdlV1): () => string {
  let max = 0;
  for (const segment of [...edl.timeline, ...edl.removed]) {
    const match = /(\d+)$/.exec(segment.id);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return () => `seg-u${++max}`;
}

function validated(edl: EdlV1): EdlV1 {
  return edlV1Schema.parse(edl);
}

// ---------------------------------------------------------------------------
// Time mapping (output = concatenation of kept segments, in timeline order)
// ---------------------------------------------------------------------------

/** Map a source position to output time; null when inside removed material. */
export function sourceToOutputMs(edl: EdlV1, sourceMs: number): number | null {
  let acc = 0;
  for (const segment of edl.timeline) {
    if (sourceMs >= segment.sourceInMs && sourceMs < segment.sourceOutMs) {
      return acc + (sourceMs - segment.sourceInMs);
    }
    acc += segment.sourceOutMs - segment.sourceInMs;
  }
  return null;
}

/** Map an output position to source time (clamped to the output duration). */
export function outputToSourceMs(edl: EdlV1, outputMs: number): number {
  let acc = 0;
  for (const segment of edl.timeline) {
    const duration = segment.sourceOutMs - segment.sourceInMs;
    if (outputMs < acc + duration) {
      return segment.sourceInMs + Math.max(0, outputMs - acc);
    }
    acc += duration;
  }
  const last = edl.timeline[edl.timeline.length - 1];
  return last ? last.sourceOutMs : 0;
}

/** The kept segment covering a source position, if any. */
export function segmentAtSource(
  edl: EdlV1,
  sourceMs: number,
): KeptSegment | null {
  return (
    edl.timeline.find(
      (s) => sourceMs >= s.sourceInMs && sourceMs < s.sourceOutMs,
    ) ?? null
  );
}

/** Next kept segment strictly after a source position (for preview skip). */
export function nextSegmentAfterSource(
  edl: EdlV1,
  sourceMs: number,
): KeptSegment | null {
  let best: KeptSegment | null = null;
  for (const segment of edl.timeline) {
    if (segment.sourceInMs > sourceMs) {
      if (!best || segment.sourceInMs < best.sourceInMs) best = segment;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Word-level ripple removal (text-based editing)
// ---------------------------------------------------------------------------

/**
 * Remove the given words from the edit (ripple). Affected kept segments are
 * split around the removed spans; removed spans join `removed` with reason
 * 'user'. Boundaries land at inter-word gap midpoints, clamped to the
 * original segment bounds.
 */
export function removeWords(
  edl: EdlV1,
  words: TranscriptWord[],
  wordIds: readonly string[],
): EdlV1 {
  const target = new Set(wordIds);
  if (target.size === 0) return edl;
  const wordById = new Map(words.map((w) => [w.id, w]));
  const makeId = nextSegmentId(edl);

  const timeline: KeptSegment[] = [];
  const removed: RemovedSegment[] = [...edl.removed];

  for (const segment of edl.timeline) {
    const segmentWordIds = segment.wordIds ?? [];
    const hasTarget = segmentWordIds.some((id) => target.has(id));
    if (!hasTarget) {
      timeline.push(segment);
      continue;
    }

    // Split the segment's word list into alternating keep/remove runs.
    const runs: { remove: boolean; ids: string[] }[] = [];
    for (const id of segmentWordIds) {
      const remove = target.has(id);
      const last = runs[runs.length - 1];
      if (last && last.remove === remove) last.ids.push(id);
      else runs.push({ remove, ids: [id] });
    }

    // Boundary between run i and i+1 = midpoint of the inter-word gap.
    const boundaries: number[] = [segment.sourceInMs];
    for (let i = 0; i < runs.length - 1; i++) {
      const lastWord = wordById.get(runs[i]!.ids[runs[i]!.ids.length - 1]!);
      const firstNext = wordById.get(runs[i + 1]!.ids[0]!);
      const mid =
        lastWord && firstNext
          ? Math.round((lastWord.endMs + firstNext.startMs) / 2)
          : segment.sourceInMs;
      boundaries.push(
        Math.min(Math.max(mid, segment.sourceInMs), segment.sourceOutMs),
      );
    }
    boundaries.push(segment.sourceOutMs);

    runs.forEach((run, index) => {
      const sourceInMs = boundaries[index]!;
      const sourceOutMs = boundaries[index + 1]!;
      if (sourceOutMs <= sourceInMs) return;
      if (run.remove) {
        removed.push({
          id: makeId(),
          sourceInMs,
          sourceOutMs,
          wordIds: run.ids,
          reason: "user",
        });
      } else {
        timeline.push({
          id: makeId(),
          sourceInMs,
          sourceOutMs,
          wordIds: run.ids,
        });
      }
    });
  }

  return validated({ ...edl, timeline, removed });
}

// ---------------------------------------------------------------------------
// Restore removed material
// ---------------------------------------------------------------------------

/**
 * Restore a removed segment into the timeline at its source-order position,
 * merging with adjacent kept segments when boundaries touch (≤1ms apart).
 */
export function restoreRemoved(edl: EdlV1, removedId: string): EdlV1 {
  const removedSegment = edl.removed.find((s) => s.id === removedId);
  if (!removedSegment) return edl;

  const removed = edl.removed.filter((s) => s.id !== removedId);
  const restored: KeptSegment = {
    id: removedSegment.id,
    sourceInMs: removedSegment.sourceInMs,
    sourceOutMs: removedSegment.sourceOutMs,
    ...(removedSegment.wordIds ? { wordIds: removedSegment.wordIds } : {}),
  };

  // Insert by source order.
  const timeline = [...edl.timeline];
  let insertAt = timeline.findIndex(
    (s) => s.sourceInMs >= restored.sourceOutMs - 1,
  );
  if (insertAt === -1) insertAt = timeline.length;
  timeline.splice(insertAt, 0, restored);

  // Merge chains of touching segments around the insertion point.
  const merged: KeptSegment[] = [];
  for (const segment of timeline) {
    const previous = merged[merged.length - 1];
    if (
      previous &&
      Math.abs(previous.sourceOutMs - segment.sourceInMs) <= 1 &&
      segment.sourceOutMs > previous.sourceOutMs
    ) {
      merged[merged.length - 1] = {
        ...previous,
        sourceOutMs: segment.sourceOutMs,
        ...(previous.wordIds || segment.wordIds
          ? { wordIds: [...(previous.wordIds ?? []), ...(segment.wordIds ?? [])] }
          : {}),
      };
    } else {
      merged.push(segment);
    }
  }

  return validated({ ...edl, timeline: merged, removed });
}

// ---------------------------------------------------------------------------
// Segment-level timeline operations
// ---------------------------------------------------------------------------

/** Adjust a segment edge. Clamps to a minimum duration and t ≥ 0. */
export function trimSegment(
  edl: EdlV1,
  segmentId: string,
  edge: "in" | "out",
  newMs: number,
  words: TranscriptWord[] = [],
): EdlV1 {
  const timeline = edl.timeline.map((segment) => {
    if (segment.id !== segmentId) return segment;
    const sourceInMs =
      edge === "in"
        ? Math.max(0, Math.min(Math.round(newMs), segment.sourceOutMs - MIN_SEGMENT_MS))
        : segment.sourceInMs;
    const sourceOutMs =
      edge === "out"
        ? Math.max(Math.round(newMs), segment.sourceInMs + MIN_SEGMENT_MS)
        : segment.sourceOutMs;
    const wordIds =
      words.length > 0
        ? words
            .filter((w) => w.startMs < sourceOutMs && w.endMs > sourceInMs)
            .filter((w) => (segment.wordIds ?? []).includes(w.id))
            .map((w) => w.id)
        : segment.wordIds;
    return {
      ...segment,
      sourceInMs,
      sourceOutMs,
      ...(wordIds ? { wordIds } : {}),
    };
  });
  return validated({ ...edl, timeline });
}

/** Split a kept segment at a source position (both halves ≥ MIN_SEGMENT_MS). */
export function splitSegmentAt(
  edl: EdlV1,
  segmentId: string,
  sourceMs: number,
  words: TranscriptWord[] = [],
): EdlV1 {
  const index = edl.timeline.findIndex((s) => s.id === segmentId);
  if (index === -1) return edl;
  const segment = edl.timeline[index]!;
  const at = Math.round(sourceMs);
  if (
    at < segment.sourceInMs + MIN_SEGMENT_MS ||
    at > segment.sourceOutMs - MIN_SEGMENT_MS
  ) {
    return edl;
  }

  const wordById = new Map(words.map((w) => [w.id, w]));
  const ids = segment.wordIds ?? [];
  const firstIds = ids.filter((id) => {
    const word = wordById.get(id);
    return word ? word.startMs < at : true;
  });
  const secondIds = ids.filter((id) => !firstIds.includes(id));

  const makeId = nextSegmentId(edl);
  const first: KeptSegment = {
    id: makeId(),
    sourceInMs: segment.sourceInMs,
    sourceOutMs: at,
    ...(ids.length ? { wordIds: firstIds } : {}),
  };
  const second: KeptSegment = {
    id: makeId(),
    sourceInMs: at,
    sourceOutMs: segment.sourceOutMs,
    ...(ids.length ? { wordIds: secondIds } : {}),
  };

  const timeline = [...edl.timeline];
  timeline.splice(index, 1, first, second);
  return validated({ ...edl, timeline });
}

/** Move a segment to a new timeline index (output-order reordering). */
export function reorderSegment(
  edl: EdlV1,
  segmentId: string,
  toIndex: number,
): EdlV1 {
  const fromIndex = edl.timeline.findIndex((s) => s.id === segmentId);
  if (fromIndex === -1) return edl;
  const clamped = Math.max(0, Math.min(toIndex, edl.timeline.length - 1));
  if (clamped === fromIndex) return edl;
  const timeline = [...edl.timeline];
  const [segment] = timeline.splice(fromIndex, 1);
  timeline.splice(clamped, 0, segment!);
  return validated({ ...edl, timeline });
}

/** Remove a kept segment from the output (ripple close), keeping it restorable. */
export function rippleDeleteSegment(edl: EdlV1, segmentId: string): EdlV1 {
  const segment = edl.timeline.find((s) => s.id === segmentId);
  if (!segment) return edl;
  return validated({
    ...edl,
    timeline: edl.timeline.filter((s) => s.id !== segmentId),
    removed: [
      ...edl.removed,
      {
        id: segment.id,
        sourceInMs: segment.sourceInMs,
        sourceOutMs: segment.sourceOutMs,
        ...(segment.wordIds ? { wordIds: segment.wordIds } : {}),
        reason: "user",
      },
    ],
  });
}
