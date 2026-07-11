import Anthropic from "@anthropic-ai/sdk";
import {
  AI_EDIT_CATEGORIES,
  AI_EDIT_COMMAND_TYPES,
  CAPTION_STYLE_TOKENS,
  edlOutputDurationMs,
  parseAnnotatedPlan,
  type AiEditPlan,
  type EdlV1,
  type TranscriptWord,
} from "@merai/core";
import { env } from "../env";
import { log } from "../logger";

/**
 * The AI Editing Brain (Build 5.5): user intent + current edit state → an
 * edit-command PLAN. Same cost rules as the analysis engine (PRD §6):
 * Haiku ONLY, exactly one call per request, temperature 0, forced tool-use
 * JSON. The Brain proposes; the editor's dispatcher is the only thing that
 * ever mutates an EDL, and only when the owner clicks Apply.
 */
const MODEL = "claude-haiku-4-5-20251001";
const MAX_OUTPUT_TOKENS = 4096;
const MAX_WORDS_PER_CALL = 4000;

export interface EditBrainInput {
  instruction: string;
  edl: EdlV1;
  words: TranscriptWord[];
  languageCode: string | null;
  /** Persisted analysis notes (fillers/retakes/false starts), if any. */
  analysisSummary: string | null;
  /** Creator's style preference (explicit setting, or derived per-request
   *  from their APPLIED suggestions when set to auto — never stored). */
  intentHint: string | null;
}

export interface EditBrain {
  readonly name: string;
  plan(input: EditBrainInput): Promise<AiEditPlan>;
}

const PLAN_TOOL: Anthropic.Tool = {
  name: "record_edit_plan",
  description:
    "Record the edit plan that fulfils the creator's instruction as a list of edit commands.",
  input_schema: {
    type: "object",
    properties: {
      goal: {
        type: "string",
        description: "Short kebab-case slug of the interpreted goal, e.g. make-shorter",
      },
      commands: {
        type: "array",
        items: {
          type: "object",
          properties: {
            type: { type: "string", enum: [...AI_EDIT_COMMAND_TYPES] },
            wordIds: {
              type: "array",
              items: { type: "string" },
              description: "For remove-words: ids of KEPT words to cut",
            },
            segmentId: {
              type: "string",
              description: "For ripple-delete-segment: a timeline segment id",
            },
            removedId: {
              type: "string",
              description: "For restore-removed: a removed segment id",
            },
            styleToken: {
              type: "string",
              enum: [...CAPTION_STYLE_TOKENS],
              description: "For set-caption-style",
            },
            aspectRatio: {
              type: "string",
              enum: ["9:16", "1:1", "16:9"],
              description: "For set-aspect-ratio",
            },
            title: {
              type: "string",
              description:
                "2-5 word headline for this change, in the transcript's language",
            },
            reason: {
              type: "string",
              description:
                "Why this change, one short sentence, transcript's language",
            },
            benefit: {
              type: "string",
              description:
                "What the creator gains, one short phrase, transcript's language. Qualitative only — NEVER invented numbers or metrics.",
            },
            category: {
              type: "string",
              enum: [...AI_EDIT_CATEGORIES],
              description:
                "hook=openings/first impression, pacing=speed/tightness, clarity=understanding, style=captions/look, platform=format fit",
            },
          },
          required: ["type", "reason", "benefit", "category"],
        },
      },
      explanation: {
        type: "string",
        description:
          "1-3 sentences for the creator, in the language of the transcript",
      },
    },
    required: ["goal", "commands", "explanation"],
  },
};

const SYSTEM_PROMPT = `You are the editing brain of Merai, an Arabic-first AI video editor. A creator gives you an instruction about their video; you return an edit plan as commands via the record_edit_plan tool. Rules:

1. You may ONLY use these commands: remove-words (cut specific kept words), ripple-delete-segment (cut a whole timeline segment), restore-removed (bring back a removed segment), set-caption-style, set-aspect-ratio. Reference ONLY ids that appear in the provided edit state — never invent ids.
2. Interpret the creator's goal faithfully: "shorter/faster" → cut weak words, digressions, slow segments; "more engaging" → tighten pacing, cut weak openings, prefer a punchy caption style; "TikTok/Shorts/Reels version" → 9:16 aspect, karaoke-highlight captions, aggressive tightening. If the instruction asks for something impossible with these commands (music, zooms, effects), do what IS possible and say what you could not do in the explanation.
3. Be conservative with content: cutting real substance the creator wanted is worse than cutting too little. Never remove so much that the story breaks. If the video already fits the goal, return zero commands and say so.
4. The creator reviews and applies your plan manually — write the explanation for them: 1-3 short sentences, in the LANGUAGE OF THE TRANSCRIPT, plain words, no jargon.
5. Cost of mistakes: every id you output is validated and a single bad id rejects the WHOLE plan. Double-check ids against the edit state.
6. ANNOTATE every command: title (2-5 words), reason (why), benefit (what the creator gains) — all in the transcript's language — and a category (hook/pacing/clarity/style/platform). Benefits are QUALITATIVE: never invent numbers, percentages, or engagement metrics. The app computes real durations itself.
7. If a creator style preference is provided, respect it as background taste — the current instruction always wins on conflicts.`;

function renderState(input: EditBrainInput): string {
  const { edl, words } = input;
  const wordById = new Map(words.map((w) => [w.id, w]));
  const seconds = (ms: number) => (ms / 1000).toFixed(1);

  const timeline = edl.timeline
    .map((segment) => {
      const text = (segment.wordIds ?? [])
        .map((id) => wordById.get(id)?.text ?? "")
        .join(" ");
      return `  ${segment.id} [${seconds(segment.sourceInMs)}s-${seconds(segment.sourceOutMs)}s]: ${text || "(no speech)"}`;
    })
    .join("\n");
  const removed = edl.removed
    .map(
      (segment) =>
        `  ${segment.id} [${seconds(segment.sourceInMs)}s-${seconds(segment.sourceOutMs)}s] reason=${segment.reason}`,
    )
    .join("\n");
  const keptIds = new Set(edl.timeline.flatMap((s) => s.wordIds ?? []));
  const wordList = words
    .map(
      (w) =>
        `${w.id}|${seconds(w.startMs)}|${w.text}|${keptIds.has(w.id) ? "kept" : "REMOVED"}`,
    )
    .join("\n");

  return [
    `Creator instruction: ${input.instruction}`,
    ...(input.intentHint
      ? [`Creator style preference (background taste): ${input.intentHint}`]
      : []),
    ``,
    `Video language: ${input.languageCode ?? "unknown"}`,
    `Current output duration: ${seconds(edlOutputDurationMs(edl))}s`,
    `Caption style: ${edl.captionStyle} (available: ${CAPTION_STYLE_TOKENS.join(", ")})`,
    `Aspect ratio: ${edl.aspectRatio}`,
    ``,
    `Timeline segments (in output order):`,
    timeline || "  (empty)",
    ``,
    `Removed segments (already cut — restore-removed may reference these; never ripple-delete them):`,
    removed || "  (none)",
    ``,
    input.analysisSummary ? `Prior AI analysis notes:\n${input.analysisSummary}\n` : ``,
    `Words (id|startSeconds|text|kept-or-REMOVED) — the ONLY valid word ids;`,
    `remove-words may target KEPT words only (REMOVED ones are already cut):`,
    wordList,
  ].join("\n");
}

type MessageCreator = (
  params: Anthropic.MessageCreateParamsNonStreaming,
) => Promise<Anthropic.Message>;

export class HaikuEditBrain implements EditBrain {
  readonly name = "haiku-edit-brain";

  constructor(private readonly createMessage: MessageCreator) {}

  static fromApiKey(apiKey: string): HaikuEditBrain {
    const client = new Anthropic({ apiKey });
    return new HaikuEditBrain((params) => client.messages.create(params));
  }

  async plan(input: EditBrainInput): Promise<AiEditPlan> {
    if (input.words.length > MAX_WORDS_PER_CALL) {
      throw new Error(
        `Transcript too large for a single edit-brain call (${input.words.length} words)`,
      );
    }
    const response = await this.createMessage({
      model: MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      temperature: 0,
      system: SYSTEM_PROMPT,
      tools: [PLAN_TOOL],
      tool_choice: { type: "tool", name: "record_edit_plan" },
      messages: [{ role: "user", content: renderState(input) }],
    });

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
    );
    if (!toolUse) throw new Error("edit brain returned no tool call");
    log.info(
      `edit brain: goal proposed (in=${response.usage.input_tokens}tok out=${response.usage.output_tokens}tok)`,
    );
    return parseAnnotatedPlan(toolUse.input);
  }
}

/** Env-driven factory (house pattern): a present ANTHROPIC_API_KEY activates
 *  the Brain; without it requests fail cleanly as 'ai-unavailable'. */
export function createEditBrain(): EditBrain | null {
  if (env.anthropicApiKey) return HaikuEditBrain.fromApiKey(env.anthropicApiKey);
  return null;
}
