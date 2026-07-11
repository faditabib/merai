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

/** Closed category set for AI edit steps (Build 5.6) — localized labels
 *  live in the UI; unknown/absent categories simply render no chip. */
export const AI_EDIT_CATEGORIES = [
  "hook",
  "pacing",
  "clarity",
  "style",
  "platform",
] as const;
export type AiEditCategory = (typeof AI_EDIT_CATEGORIES)[number];

/**
 * Presentation metadata for ONE command, produced inline by the Brain and
 * split off before the command reaches the dispatcher. Everything here is
 * qualitative model output shown to the creator — durations and counts are
 * derived from the EDL by the UI, never invented by the model.
 */
export const aiEditStepSchema = z.object({
  title: z.string().max(80).optional(),
  reason: z.string().max(300).optional(),
  benefit: z.string().max(200).optional(),
  category: z.enum(AI_EDIT_CATEGORIES).optional(),
});
export type AiEditStep = z.infer<typeof aiEditStepSchema>;

const ANNOTATION_KEYS = ["title", "reason", "benefit", "category"] as const;

export const aiEditPlanSchema = z.object({
  /** Short kebab-case slug the model assigns, e.g. "make-shorter". */
  goal: z.string().min(1).max(80),
  commands: z.array(editCommandSchema).max(MAX_AI_PLAN_COMMANDS),
  /** Creator-facing, in the transcript's language. */
  explanation: z.string().min(1).max(1000),
  /** Index-aligned presentation steps (Build 5.6); absent on old plans. */
  steps: z.array(aiEditStepSchema).optional(),
});
export type AiEditPlan = z.infer<typeof aiEditPlanSchema>;

/**
 * Parse a raw Brain tool payload whose commands carry INLINE annotations
 * (title/reason/benefit/category on each command object — annotating inline
 * avoids index-alignment hazards). Splits every item into the pure command
 * (dispatcher contract untouched) + its presentation step. Plain
 * unannotated commands parse fine — steps just come back empty.
 */
export function parseAnnotatedPlan(raw: unknown): AiEditPlan {
  const outer = z
    .object({
      goal: z.string().min(1).max(80),
      commands: z.array(z.record(z.string(), z.unknown())).max(MAX_AI_PLAN_COMMANDS),
      explanation: z.string().min(1).max(1000),
    })
    .parse(raw);

  const commands: EditCommand[] = [];
  const steps: AiEditStep[] = [];
  for (const item of outer.commands) {
    const annotation: Record<string, unknown> = {};
    const rest: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(item)) {
      if ((ANNOTATION_KEYS as readonly string[]).includes(key)) {
        annotation[key] = value;
      } else {
        rest[key] = value;
      }
    }
    commands.push(editCommandSchema.parse(rest));
    // A malformed annotation must never sink a valid command — presentation
    // is best-effort, mutation is strict.
    const parsedStep = aiEditStepSchema.safeParse(annotation);
    steps.push(parsedStep.success ? parsedStep.data : {});
  }
  return { goal: outer.goal, explanation: outer.explanation, commands, steps };
}

export type AiPlanRejection =
  | { ok: false; reason: "command-type-not-allowed"; detail: string }
  | { ok: false; reason: "unknown-segment"; detail: string }
  | { ok: false; reason: "unknown-word"; detail: string }
  | { ok: false; reason: "unknown-caption-style"; detail: string }
  | { ok: false; reason: "apply-failed"; detail: string };

export type AiPlanValidation =
  | { ok: true; edl: EdlV1; commands: EditCommand[]; steps: AiEditStep[] }
  | AiPlanRejection;

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
  const knownWordIds = new Set(words.map((w) => w.id));
  const timelineIds = new Set(edl.timeline.map((s) => s.id));
  const removedIds = new Set(edl.removed.map((s) => s.id));
  const allowed = new Set<string>(AI_EDIT_COMMAND_TYPES);

  // Normalized copy: intents the edit already satisfies (removing a word
  // that IS already removed) are dropped rather than failing the plan —
  // that's deduplication, not flattening. Ids that exist NOWHERE remain a
  // hard reject: those are hallucinations. Presentation steps travel WITH
  // their command through normalization (dropped together, kept together).
  const planSteps = plan.steps ?? [];
  const commands: EditCommand[] = [];
  const steps: AiEditStep[] = [];
  const keep = (command: EditCommand, index: number) => {
    commands.push(command);
    steps.push(planSteps[index] ?? {});
  };
  let index = -1;
  for (const command of plan.commands) {
    index += 1;
    if (!allowed.has(command.type)) {
      return { ok: false, reason: "command-type-not-allowed", detail: command.type };
    }
    switch (command.type) {
      case "remove-words": {
        for (const id of command.wordIds) {
          if (!knownWordIds.has(id)) {
            return { ok: false, reason: "unknown-word", detail: id };
          }
        }
        const stillKept = command.wordIds.filter((id) => keptWordIds.has(id));
        if (stillKept.length > 0) {
          keep({ ...command, wordIds: stillKept }, index);
        }
        break;
      }
      case "ripple-delete-segment":
        if (!timelineIds.has(command.segmentId)) {
          return { ok: false, reason: "unknown-segment", detail: command.segmentId };
        }
        keep(command, index);
        break;
      case "restore-removed":
        if (!removedIds.has(command.removedId)) {
          return { ok: false, reason: "unknown-segment", detail: command.removedId };
        }
        keep(command, index);
        break;
      case "set-caption-style":
        if (!(CAPTION_STYLE_TOKENS as readonly string[]).includes(command.styleToken)) {
          return { ok: false, reason: "unknown-caption-style", detail: command.styleToken };
        }
        keep(command, index);
        break;
      default:
        // set-aspect-ratio: fully constrained by its zod enum already.
        keep(command, index);
    }
  }

  try {
    return {
      ok: true,
      edl: applyEditCommands(edl, words, commands),
      commands,
      steps,
    };
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

/** Steps as stored on an ai_suggestions row; null/absent → empty (old rows). */
export function parseStoredAiSteps(raw: unknown): AiEditStep[] {
  if (raw == null) return [];
  const parsed = z.array(aiEditStepSchema).safeParse(raw);
  return parsed.success ? parsed.data : [];
}

export const AI_FEEDBACK_VALUES = ["helpful", "not-useful"] as const;
export type AiFeedback = (typeof AI_FEEDBACK_VALUES)[number];

export const AI_FEEDBACK_REASONS = [
  "prefer-original",
  "misunderstood-context",
  "wrong-cut",
  "other",
] as const;
export type AiFeedbackReason = (typeof AI_FEEDBACK_REASONS)[number];

export const AI_INTENTS = ["auto", "short-form", "educational", "general"] as const;
export type AiIntent = (typeof AI_INTENTS)[number];

export const aiSuggestionStatusSchema = z.enum([
  "pending",
  "processing",
  "ready",
  "failed",
  "applied",
  "dismissed",
]);
export type AiSuggestionStatus = z.infer<typeof aiSuggestionStatusSchema>;
