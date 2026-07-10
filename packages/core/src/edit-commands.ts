import { z } from "zod";
import { aspectRatioSchema, type EdlV1 } from "./edl";
import {
  removeWords,
  reorderSegment,
  restoreRemoved,
  rippleDeleteSegment,
  splitSegmentAt,
  trimSegment,
} from "./edl-ops";
import type { TranscriptWord } from "./transcript";

/**
 * Serializable edit commands — the shared mutation entry point for the editor
 * UI and future AI re-editing (Build 5 seam). A command is data: it can come
 * from a click handler today or from a model's tool output tomorrow, and both
 * are zod-validated before touching the EDL, then routed to the same pure,
 * tested ops in edl-ops.ts. Undo/redo stays a snapshot stack in the caller.
 */

export const editCommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("remove-words"), wordIds: z.array(z.string()).min(1) }),
  z.object({ type: z.literal("restore-removed"), removedId: z.string().min(1) }),
  z.object({
    type: z.literal("trim-segment"),
    segmentId: z.string().min(1),
    edge: z.enum(["in", "out"]),
    ms: z.number(),
  }),
  z.object({
    type: z.literal("split-segment"),
    segmentId: z.string().min(1),
    sourceMs: z.number(),
  }),
  z.object({
    type: z.literal("reorder-segment"),
    segmentId: z.string().min(1),
    toIndex: z.number().int().nonnegative(),
  }),
  z.object({ type: z.literal("ripple-delete-segment"), segmentId: z.string().min(1) }),
  z.object({ type: z.literal("set-caption-style"), styleToken: z.string().min(1) }),
  z.object({ type: z.literal("set-aspect-ratio"), aspectRatio: aspectRatioSchema }),
]);
export type EditCommand = z.infer<typeof editCommandSchema>;

/** Apply one validated command. Pure; unknown shapes throw via zod. */
export function applyEditCommand(
  edl: EdlV1,
  words: TranscriptWord[],
  command: EditCommand,
): EdlV1 {
  const cmd = editCommandSchema.parse(command);
  switch (cmd.type) {
    case "remove-words":
      return removeWords(edl, words, cmd.wordIds);
    case "restore-removed":
      return restoreRemoved(edl, cmd.removedId);
    case "trim-segment":
      return trimSegment(edl, cmd.segmentId, cmd.edge, cmd.ms, words);
    case "split-segment":
      return splitSegmentAt(edl, cmd.segmentId, cmd.sourceMs, words);
    case "reorder-segment":
      return reorderSegment(edl, cmd.segmentId, cmd.toIndex);
    case "ripple-delete-segment":
      return rippleDeleteSegment(edl, cmd.segmentId);
    case "set-caption-style":
      return { ...edl, captionStyle: cmd.styleToken };
    case "set-aspect-ratio":
      return { ...edl, aspectRatio: cmd.aspectRatio };
  }
}

/** Apply a batch (e.g. an AI re-edit plan) atomically: any invalid command
 *  throws before any state escapes, so callers commit all-or-nothing. */
export function applyEditCommands(
  edl: EdlV1,
  words: TranscriptWord[],
  commands: EditCommand[],
): EdlV1 {
  const parsed = commands.map((c) => editCommandSchema.parse(c));
  return parsed.reduce((acc, cmd) => applyEditCommand(acc, words, cmd), edl);
}
