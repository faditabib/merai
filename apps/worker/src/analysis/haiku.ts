import Anthropic from "@anthropic-ai/sdk";
import {
  isFillerCandidate,
  LOW_CONFIDENCE_THRESHOLD,
  type TranscriptWord,
} from "@merai/core";
import { log } from "../logger";
import {
  analysisResultSchema,
  type AnalysisEngine,
  type AnalysisInput,
  type AnalysisResult,
} from "./types";

/**
 * Claude Haiku analysis engine.
 *
 * Cost rules (PRD §6 — margin decision):
 *  - Haiku ONLY. Never Sonnet/Opus in runtime calls.
 *  - Exactly one call per video analysis; the result is persisted on the
 *    transcript so EDL regeneration never re-bills the model.
 *  - Output is a forced tool call, so responses are schema-shaped JSON —
 *    no free-form parsing retries.
 */
const MODEL = "claude-haiku-4-5-20251001";
const MAX_OUTPUT_TOKENS = 4096;

/** Words per request guard; a 10-min video lands well under this. */
const MAX_WORDS_PER_CALL = 4000;

const ANALYSIS_TOOL: Anthropic.Tool = {
  name: "record_analysis",
  description:
    "Record which transcript words are fillers, false starts, or weaker retakes to remove from the edit.",
  input_schema: {
    type: "object",
    properties: {
      fillers: {
        type: "array",
        items: {
          type: "object",
          properties: {
            wordIds: { type: "array", items: { type: "string" }, minItems: 1 },
            note: { type: "string" },
          },
          required: ["wordIds"],
        },
      },
      falseStarts: {
        type: "array",
        items: {
          type: "object",
          properties: {
            startWordId: { type: "string" },
            endWordId: { type: "string" },
            note: { type: "string" },
          },
          required: ["startWordId", "endWordId"],
        },
      },
      retakes: {
        type: "array",
        items: {
          type: "object",
          properties: {
            takes: {
              type: "array",
              minItems: 2,
              items: {
                type: "object",
                properties: {
                  startWordId: { type: "string" },
                  endWordId: { type: "string" },
                },
                required: ["startWordId", "endWordId"],
              },
            },
            keepIndex: { type: "integer", minimum: 0 },
            note: { type: "string" },
          },
          required: ["takes", "keepIndex"],
        },
      },
    },
    required: ["fillers", "falseStarts", "retakes"],
  },
};

const SYSTEM_PROMPT = `You are the editing brain of Merai, an Arabic-first AI video editor. You receive a speech transcript with word-level timing and confidence, and you decide what a professional editor would cut. Record your decision via the record_analysis tool. Rules:

1. FILLERS: hesitation/discourse words that add nothing (Arabic: يعني، اه، طب، بس… English: um, uh, like, you know…). CRITICAL: many are context-dependent — يعني as "I mean/that is" mid-thought is filler, but يعني as the verb "it means" is content. طب as "okay well" is filler, الطب (medicine) is content. Judge each occurrence in context.
2. LOW-CONFIDENCE WORDS are marked [?]. Speech-to-text sometimes merges a hesitation into the next word (e.g. اه+رفع → أهرفع). If a [?] word looks like such a merge or a garbled hesitation, classify it as filler; if it looks like real content misheard, leave it.
3. FALSE STARTS: a sentence begun then abandoned and restarted ("Today we... — Actually, today we're going to..."). Remove the abandoned fragment including any explicit restart announcements ("let me start over", "من الأول").
4. RETAKES: the same line delivered more than once (speaker re-recording). Group ALL takes of the same line; keep the strongest: complete, fewest fillers, most fluent. Prefer the later take when quality is equal (speakers usually re-record because the earlier take failed).
5. Be conservative: when unsure whether something is content, KEEP it. A missed filler is a minor flaw; a removed real word is a broken video.
6. Long pauses/silence are handled elsewhere — ignore gaps, judge only words.
7. NOTES: every note/reason you write is shown to the creator inside the product UI. Write notes in the LANGUAGE OF THE TRANSCRIPT (Arabic transcript → Arabic notes, English transcript → English notes). Keep them short and plain — one sentence a creator understands, not linguistics jargon.`;

type MessageCreator = (
  params: Anthropic.MessageCreateParamsNonStreaming,
) => Promise<Anthropic.Message>;

export class HaikuAnalysisEngine implements AnalysisEngine {
  readonly name = "haiku";

  constructor(private readonly createMessage: MessageCreator) {}

  static fromApiKey(apiKey: string): HaikuAnalysisEngine {
    const client = new Anthropic({ apiKey });
    return new HaikuAnalysisEngine((params) => client.messages.create(params));
  }

  async analyze(input: AnalysisInput): Promise<AnalysisResult> {
    if (input.words.length === 0) {
      return { fillers: [], falseStarts: [], retakes: [] };
    }
    if (input.words.length > MAX_WORDS_PER_CALL) {
      // 10-min cap makes this near-impossible; fail loudly rather than
      // silently truncating someone's content.
      throw new Error(
        `Transcript too large for single-call analysis (${input.words.length} words)`,
      );
    }

    const response = await this.createMessage({
      model: MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      temperature: 0,
      system: SYSTEM_PROMPT,
      tools: [ANALYSIS_TOOL],
      tool_choice: { type: "tool", name: "record_analysis" },
      messages: [
        {
          role: "user",
          content: renderTranscript(input.words, input.languageCode),
        },
      ],
    });

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
    );
    if (!toolUse) {
      throw new Error("Haiku analysis returned no tool call");
    }

    const parsed = analysisResultSchema.safeParse(toolUse.input);
    if (!parsed.success) {
      throw new Error(`Haiku analysis failed schema validation: ${parsed.error.message}`);
    }

    log.info(
      `haiku analysis: ${parsed.data.fillers.length} filler groups, ${parsed.data.falseStarts.length} false starts, ${parsed.data.retakes.length} retake groups (in=${response.usage.input_tokens}tok out=${response.usage.output_tokens}tok)`,
    );
    return parsed.data;
  }
}

/** Compact line format: id|text|flags — timing in seconds to save tokens. */
function renderTranscript(
  words: TranscriptWord[],
  languageCode: string | null,
): string {
  const lines = words.map((word) => {
    const flags: string[] = [];
    if ((word.confidence ?? 1) < LOW_CONFIDENCE_THRESHOLD) flags.push("[?]");
    if (isFillerCandidate(word.text)) flags.push("[f?]");
    return `${word.id}|${(word.startMs / 1000).toFixed(2)}|${word.text}${flags.length ? " " + flags.join("") : ""}`;
  });

  return [
    `Language: ${languageCode ?? "unknown"}.`,
    `Words (id|startSeconds|text, [?]=low confidence, [f?]=filler candidate):`,
    ...lines,
  ].join("\n");
}
