import { z } from "zod";
import { CAPTION_STYLE_TOKENS } from "./captions";
import { applyEditCommands, editCommandSchema, type EditCommand } from "./edit-commands";
import type { EdlV1 } from "./edl";
import type { TranscriptWord } from "./transcript";

/**
 * AI Editing Brain contract (Build 5.5). The Brain's entire output is a
 * PLAN — a goal slug, a list of edit commands, and a creator-facing
 * explanation. It never emits EDL JSON and never mutates anything: the plan
 * is validated here (schema → referential checks → full dry-run through the
 * same dispatcher the editor UI uses) and applied only when the owner
 * clicks Apply in the editor.
 */

/**
 * Command subset the Brain may emit in v1 — deliberately conservative.
 * Millisecond/index-argument commands (trim/split/reorder) are excluded
 * until per-op guardrails exist: ids either exist or they don't, but a
 * hallucinated timestamp is a subtle bad edit.
 */
export const AI_EDIT_COMMAND_TYPES = [
  "remove-words",
  "ripple-delete-segment",
  "restore-removed",
  "set-caption-style",
  "set-aspect-ratio",
] as const;
export type AiEditCommandType = (typeof AI_EDIT_COMMAND_TYPES)[number];

export const MAX_AI_INSTRUCTION_CHARS = 500;
export const MAX_AI_PLAN_COMMANDS = 40;

export const aiEditPlanSchema = z.object({
  /** Short kebab-case slug the model assigns, e.g. "make-shorter". */
  goal: z.string().min(1).max(80),
  commands: z.array(editCommandSchema).max(MAX_AI_PLAN_COMMANDS),
  /** Creator-facing, in the transcript's language. */
  explanation: z.string().min(1).max(1000),
});
export type AiEditPlan = z.infer<typeof aiEditPlanSchema>;

export type AiPlanRejection =
  | { ok: false; reason: "command-type-not-allowed"; detail: string }
  | { ok: false; reason: "unknown-segment"; detail: string }
  | { ok: false; reason: "unknown-word"; detail: string }
  | { ok: false; reason: "unknown-caption-style"; detail: string }
  | { ok: false; reason: "apply-failed"; detail: string };

export type AiPlanValidation = { ok: true; edl: EdlV1 } | AiPlanRejection;

/**
 * Validate a plan against the exact EDL it will be applied to:
 * 1. every command type is in the v1 allowlist,
 * 2. every referenced id/token exists in the base EDL,
 * 3. the whole batch dry-runs through applyEditCommands (all-or-nothing).
 * Only a plan that passes all three may reach the editor as `ready`.
 */
export function validateAiEditPlan(
  edl: EdlV1,
  words: TranscriptWord[],
  plan: AiEditPlan,
): AiPlanValidation {
  const keptWordIds = new Set(
    edl.timeline.flatMap((segment) => segment.wordIds ?? []),
  );
  const timelineIds = new Set(edl.timeline.map((s) => s.id));
  const removedIds = new Set(edl.removed.map((s) => s.id));
  const allowed = new Set<string>(AI_EDIT_COMMAND_TYPES);

  for (const command of plan.commands) {
    if (!allowed.has(command.type)) {
      return { ok: false, reason: "command-type-not-allowed", detail: command.type };
    }
    switch (command.type) {
      case "remove-words":
        for (const id of command.wordIds) {
          if (!keptWordIds.has(id)) {
            return { ok: false, reason: "unknown-word", detail: id };
          }
        }
        break;
      case "ripple-delete-segment":
        if (!timelineIds.has(command.segmentId)) {
          return { ok: false, reason: "unknown-segment", detail: command.segmentId };
        }
        break;
      case "restore-removed":
        if (!removedIds.has(command.removedId)) {
          return { ok: false, reason: "unknown-segment", detail: command.removedId };
        }
        break;
      case "set-caption-style":
        if (!(CAPTION_STYLE_TOKENS as readonly string[]).includes(command.styleToken)) {
          return { ok: false, reason: "unknown-caption-style", detail: command.styleToken };
        }
        break;
      // set-aspect-ratio: fully constrained by its zod enum already.
    }
  }

  try {
    return { ok: true, edl: applyEditCommands(edl, words, plan.commands) };
  } catch (error) {
    return {
      ok: false,
      reason: "apply-failed",
      detail: error instanceof Error ? error.message.slice(0, 200) : "unknown",
    };
  }
}

/** Commands as stored on an ai_suggestions row (validated jsonb). */
export function parseStoredAiCommands(raw: unknown): EditCommand[] {
  return z.array(editCommandSchema).parse(raw);
}

export const aiSuggestionStatusSchema = z.enum([
  "pending",
  "processing",
  "ready",
  "failed",
  "applied",
  "dismissed",
]);
export type AiSuggestionStatus = z.infer<typeof aiSuggestionStatusSchema>;
