import Anthropic from "@anthropic-ai/sdk";
import {
  AI_EDIT_COMMAND_TYPES,
  aiEditPlanSchema,
  CAPTION_STYLE_TOKENS,
  edlOutputDurationMs,
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
          },
          required: ["type"],
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
5. Cost of mistakes: every id you output is validated and a single bad id rejects the WHOLE plan. Double-check ids against the edit state.`;

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
  const wordList = words
    .map((w) => `${w.id}|${seconds(w.startMs)}|${w.text}`)
    .join("\n");

  return [
    `Creator instruction: ${input.instruction}`,
    ``,
    `Video language: ${input.languageCode ?? "unknown"}`,
    `Current output duration: ${seconds(edlOutputDurationMs(edl))}s`,
    `Caption style: ${edl.captionStyle} (available: ${CAPTION_STYLE_TOKENS.join(", ")})`,
    `Aspect ratio: ${edl.aspectRatio}`,
    ``,
    `Timeline segments (in output order):`,
    timeline || "  (empty)",
    ``,
    `Removed segments (restorable):`,
    removed || "  (none)",
    ``,
    input.analysisSummary ? `Prior AI analysis notes:\n${input.analysisSummary}\n` : ``,
    `Words (id|startSeconds|text) — the ONLY valid word ids:`,
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
    return aiEditPlanSchema.parse(toolUse.input);
  }
}

/** Env-driven factory (house pattern): a present ANTHROPIC_API_KEY activates
 *  the Brain; without it requests fail cleanly as 'ai-unavailable'. */
export function createEditBrain(): EditBrain | null {
  if (env.anthropicApiKey) return HaikuEditBrain.fromApiKey(env.anthropicApiKey);
  return null;
}
