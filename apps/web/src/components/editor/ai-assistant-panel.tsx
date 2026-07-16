"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  MAX_AI_INSTRUCTION_CHARS,
  parseStoredAiCommands,
  parseStoredAiSteps,
  recommendedSkills,
  skillBrainRequest,
  type AiEditStep,
  type AiFeedback,
  type AiFeedbackReason,
  type AiIntent,
  type CreatorTypeId,
  type EditCommand,
  type EdlV1,
  type SkillDefinition,
  type TranscriptWord,
} from "@merai/core";
import { requestAiEdit } from "@/app/actions/projects";
import { createClient } from "@/lib/supabase/client";

const POLL_INTERVAL_MS = 2_500;

interface SuggestionRow {
  id: string;
  status: string;
  edl_version_id: string;
  goal: string | null;
  commands: unknown;
  steps: unknown;
  explanation: string | null;
  error: string | null;
}

const SUGGESTION_COLUMNS =
  "id, status, edl_version_id, goal, commands, steps, explanation, error";
const PRESET_KEYS = ["shorter", "engaging", "tiktok"] as const;
const FEEDBACK_REASONS: AiFeedbackReason[] = [
  "prefer-original",
  "misunderstood-context",
  "wrong-cut",
  "other",
];
const INTENTS: AiIntent[] = ["auto", "short-form", "educational", "general"];

/**
 * AI Re-Edit Assistant (Build 5.5, presentation + feedback in 5.6). The
 * creator states a goal; the Brain answers with a VALIDATED command plan;
 * nothing touches the working EDL until Apply — one undoable batch through
 * the editor's dispatcher. 5.6 adds: apply preview (derived counts — real
 * numbers only, computed from the stored commands), per-step recommendation
 * cards (action/target from the EDL, reason/benefit/category from the
 * model), 👍/👎 feedback persisted on the suggestion row, and a visible,
 * editable intent preference (nothing derived is ever stored).
 */
export function AiAssistantPanel(props: {
  projectId: string;
  ownerId: string;
  savedVersionId: string;
  dirty: boolean;
  edl: EdlV1;
  words: TranscriptWord[];
  /** Build 8: persona (user_metadata.creator_type) — ranks the skills row. */
  creatorType: CreatorTypeId | null;
  ensureSavedVersion: () => Promise<string | null>;
  onApplyCommands: (commands: EditCommand[]) => void;
}) {
  const t = useTranslations("editor.aiAssistant");
  const tEditor = useTranslations("editor");
  const supabase = useRef(createClient()).current;

  const [instruction, setInstruction] = useState("");
  const [suggestion, setSuggestion] = useState<SuggestionRow | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [requestError, setRequestError] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [feedback, setFeedback] = useState<AiFeedback | null>(null);
  const [feedbackReason, setFeedbackReason] = useState<AiFeedbackReason | null>(null);
  const [intent, setIntent] = useState<AiIntent>("auto");

  const working =
    requesting ||
    suggestion?.status === "pending" ||
    suggestion?.status === "processing";

  // Load the visible, editable intent preference.
  useEffect(() => {
    void supabase
      .from("ai_preferences")
      .select("intent")
      .eq("owner_id", props.ownerId)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.intent) setIntent(data.intent as AiIntent);
      });
  }, [props.ownerId, supabase]);

  const saveIntent = useCallback(
    (next: AiIntent) => {
      setIntent(next);
      void supabase
        .from("ai_preferences")
        .upsert({ owner_id: props.ownerId, intent: next })
        .then(() => undefined);
    },
    [props.ownerId, supabase],
  );

  // Poll while the Brain works (house pattern).
  useEffect(() => {
    if (!suggestion || !["pending", "processing"].includes(suggestion.status)) {
      return;
    }
    const timer = setInterval(async () => {
      const { data } = await supabase
        .from("ai_suggestions")
        .select(SUGGESTION_COLUMNS)
        .eq("id", suggestion.id)
        .maybeSingle();
      if (data) setSuggestion(data as SuggestionRow);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [suggestion, supabase]);

  /** Build 8: one tap = the skill's intent (visible, editable — the 5.6
   *  explicit-preference rule) + its instruction through the normal flow. */
  const runSkill = (skill: SkillDefinition) => {
    const brainRequest = skillBrainRequest(skill);
    saveIntent(brainRequest.intent);
    setInstruction(brainRequest.instruction);
    void request(brainRequest.instruction);
  };

  const request = useCallback(
    async (text: string) => {
      const trimmed = text.trim().slice(0, MAX_AI_INSTRUCTION_CHARS);
      if (!trimmed || working) return;
      setRequesting(true);
      setRequestError(false);
      setReviewOpen(false);
      setFeedback(null);
      setFeedbackReason(null);
      setSuggestion(null);
      try {
        const versionId = await props.ensureSavedVersion();
        if (!versionId) throw new Error("save-failed");
        const { data: row, error } = await supabase
          .from("ai_suggestions")
          .insert({
            project_id: props.projectId,
            owner_id: props.ownerId,
            edl_version_id: versionId,
            instruction: trimmed,
          })
          .select(SUGGESTION_COLUMNS)
          .single();
        if (error || !row) throw error ?? new Error("insert-failed");
        const queued = await requestAiEdit({ suggestionId: row.id as string });
        if (!queued.ok) throw new Error(queued.error);
        setSuggestion(row as SuggestionRow);
      } catch {
        setRequestError(true);
      } finally {
        setRequesting(false);
      }
    },
    [props, supabase, working],
  );

  const patchSuggestion = useCallback(
    (patch: Record<string, unknown>) => {
      if (!suggestion) return;
      void supabase
        .from("ai_suggestions")
        .update(patch)
        .eq("id", suggestion.id)
        .then(() => undefined);
    },
    [suggestion, supabase],
  );

  const ready = suggestion?.status === "ready";
  const appliedState = suggestion?.status === "applied";
  const stale =
    ready && (props.dirty || suggestion!.edl_version_id !== props.savedVersionId);

  const commands: EditCommand[] =
    ready || appliedState
      ? (() => {
          try {
            return parseStoredAiCommands(suggestion!.commands);
          } catch {
            return [];
          }
        })()
      : [];
  const steps: AiEditStep[] =
    ready || appliedState ? parseStoredAiSteps(suggestion!.steps) : [];

  // Apply preview: REAL numbers derived from the stored commands.
  const cutCount = commands.filter(
    (c) => c.type === "remove-words" || c.type === "ripple-delete-segment",
  ).length;
  const restoreCount = commands.filter((c) => c.type === "restore-removed").length;
  const changesStyle = commands.some((c) => c.type === "set-caption-style");
  const changesAspect = commands.some((c) => c.type === "set-aspect-ratio");

  const apply = () => {
    if (!ready || stale) return;
    props.onApplyCommands(commands);
    patchSuggestion({ status: "applied" });
    setSuggestion({ ...suggestion!, status: "applied" });
    setReviewOpen(false);
  };

  const dismiss = () => {
    patchSuggestion({ status: "dismissed" });
    setSuggestion(null);
  };

  const giveFeedback = (value: AiFeedback) => {
    setFeedback(value);
    if (value === "helpful") {
      patchSuggestion({ feedback: value, feedback_reason: null });
    }
    // not-useful waits for the optional reason (or "other" default on skip).
  };

  const giveReason = (reason: AiFeedbackReason) => {
    setFeedbackReason(reason);
    patchSuggestion({ feedback: "not-useful", feedback_reason: reason });
  };

  /** Presentation derivation — the "target" column of a step card. */
  const describeTarget = (command: EditCommand): string | null => {
    switch (command.type) {
      case "remove-words": {
        const byId = new Map(props.words.map((w) => [w.id, w.text]));
        const text = command.wordIds
          .map((id) => byId.get(id) ?? "")
          .filter(Boolean)
          .join(" ");
        return t("targetWords", {
          count: command.wordIds.length,
          text: text.length > 40 ? `${text.slice(0, 40)}…` : text,
        });
      }
      case "ripple-delete-segment": {
        const segment = props.edl.timeline.find((s) => s.id === command.segmentId);
        if (!segment) return null;
        return t("targetSegment", {
          seconds: Math.round((segment.sourceOutMs - segment.sourceInMs) / 100) / 10,
        });
      }
      case "restore-removed": {
        const segment = props.edl.removed.find((s) => s.id === command.removedId);
        if (!segment) return null;
        return t("targetSegment", {
          seconds: Math.round((segment.sourceOutMs - segment.sourceInMs) / 100) / 10,
        });
      }
      case "set-caption-style":
        return tEditor(`captionPresets.${command.styleToken}`);
      case "set-aspect-ratio":
        return command.aspectRatio;
      default:
        return null;
    }
  };

  const actionLabel = (command: EditCommand): string => {
    switch (command.type) {
      case "remove-words":
        return t("actions.removeWords");
      case "ripple-delete-segment":
        return t("actions.deleteSegment");
      case "restore-removed":
        return t("actions.restore");
      case "set-caption-style":
        return t("actions.style");
      case "set-aspect-ratio":
        return t("actions.aspect");
      default:
        return command.type;
    }
  };

  const feedbackBlock = (
    <div className="flex flex-col gap-2">
      {feedback === null && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">{t("feedback.prompt")}</span>
          <button
            type="button"
            onClick={() => giveFeedback("helpful")}
            className="rounded-full border border-border px-3 py-1 text-xs hover:border-emerald-500 hover:text-emerald-600"
          >
            👍 {t("feedback.helpful")}
          </button>
          <button
            type="button"
            onClick={() => giveFeedback("not-useful")}
            className="rounded-full border border-border px-3 py-1 text-xs hover:border-red-500 hover:text-red-500"
          >
            👎 {t("feedback.notUseful")}
          </button>
        </div>
      )}
      {feedback === "not-useful" && feedbackReason === null && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">{t("feedback.why")}</span>
          {FEEDBACK_REASONS.map((reason) => (
            <button
              key={reason}
              type="button"
              onClick={() => giveReason(reason)}
              className="rounded-full border border-border px-3 py-1 text-xs text-muted hover:border-accent hover:text-accent"
            >
              {t(`feedback.reasons.${reason}`)}
            </button>
          ))}
        </div>
      )}
      {(feedback === "helpful" || feedbackReason !== null) && (
        <p role="status" className="text-xs text-muted">
          {t("feedback.thanks")}
        </p>
      )}
    </div>
  );

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-semibold">{t("title")}</h2>
          <span className="text-xs text-muted">{t("subtitle")}</span>
        </div>
        {/* Visible, editable intent — the only stored preference. */}
        <label className="flex items-center gap-2 text-xs text-muted">
          {t("preference.label")}
          <select
            value={intent}
            onChange={(event) => saveIntent(event.target.value as AiIntent)}
            className="rounded-lg border border-border bg-card px-2 py-1 text-xs"
          >
            {INTENTS.map((value) => (
              <option key={value} value={value}>
                {t(`preference.${value}`)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Skills (Build 8): productized workflows, persona-ranked. One tap
          runs the Brain with the skill's instruction + intent. */}
      <div className="flex flex-col gap-1.5">
        <span className="text-xs text-muted">{t("skills.title")}</span>
        <div className="flex flex-wrap gap-2">
          {recommendedSkills(props.creatorType).map((skill) => (
            <button
              key={skill.id}
              type="button"
              disabled={working}
              onClick={() => runSkill(skill)}
              title={t(`skills.hints.${skill.id}`)}
              className="rounded-full border border-accent/40 bg-accent/5 px-3 py-1 text-sm text-accent transition hover:bg-accent/15 disabled:opacity-40"
            >
              ⚡ {t(`skills.names.${skill.id}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {PRESET_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            disabled={working}
            onClick={() => {
              setInstruction(t(`presets.${key}`));
              void request(t(`presets.${key}`));
            }}
            className="rounded-full border border-border px-3 py-1 text-sm text-muted transition hover:border-accent hover:text-accent disabled:opacity-40"
          >
            {t(`presets.${key}`)}
          </button>
        ))}
      </div>

      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void request(instruction);
        }}
      >
        <input
          type="text"
          value={instruction}
          maxLength={MAX_AI_INSTRUCTION_CHARS}
          onChange={(event) => setInstruction(event.target.value)}
          placeholder={t("placeholder")}
          className="min-w-0 flex-1 rounded-xl border border-border bg-transparent px-4 py-2 text-sm outline-none focus:border-accent"
        />
        <button
          type="submit"
          disabled={working || instruction.trim().length === 0}
          className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-40"
        >
          {working ? t("thinking") : t("send")}
        </button>
      </form>

      {working && <p className="text-sm text-muted">{t("workingNote")}</p>}
      {requestError && (
        <p role="alert" className="text-sm text-red-500">
          {t("requestError")}
        </p>
      )}

      {suggestion?.status === "failed" && (
        <p role="alert" className="text-sm text-red-500">
          {suggestion.error === "ai-unavailable"
            ? t("errors.ai-unavailable")
            : t("errors.generic")}
        </p>
      )}

      {/* Ready: recommendation + apply preview (real numbers only). */}
      {ready && (
        <div className="flex flex-col gap-3 rounded-xl border border-accent/30 bg-accent/5 p-4">
          <p className="text-sm leading-relaxed">{suggestion!.explanation}</p>

          <div className="flex flex-col gap-1 text-sm">
            <span className="text-xs font-medium text-muted">
              {t("planSummary")}
            </span>
            {cutCount > 0 && <span>✓ {t("summaryCuts", { count: cutCount })}</span>}
            {restoreCount > 0 && (
              <span>✓ {t("summaryRestores", { count: restoreCount })}</span>
            )}
            {changesStyle && <span>✓ {t("summaryStyle")}</span>}
            {changesAspect && <span>✓ {t("summaryAspect")}</span>}
            <span className="text-xs text-muted">{t("safeNote")}</span>
          </div>

          {stale && <p className="text-xs text-amber-600">{t("staleWarning")}</p>}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={apply}
              disabled={stale || commands.length === 0}
              className="rounded-lg bg-accent px-4 py-1.5 text-sm font-semibold text-accent-foreground disabled:opacity-40"
            >
              {t("apply")}
            </button>
            <button
              type="button"
              onClick={() => setReviewOpen((open) => !open)}
              disabled={commands.length === 0}
              className="rounded-lg border border-border px-4 py-1.5 text-sm hover:border-accent hover:text-accent disabled:opacity-40"
            >
              {reviewOpen ? t("hideReview") : t("review")}
            </button>
            <button
              type="button"
              onClick={dismiss}
              className="rounded-lg border border-border px-4 py-1.5 text-sm text-muted hover:border-accent hover:text-accent"
            >
              {t("dismiss")}
            </button>
          </div>

          {/* Review: one recommendation card per change. */}
          {reviewOpen && (
            <ul className="flex flex-col gap-2">
              {commands.map((command, index) => {
                const step = steps[index] ?? {};
                const target = describeTarget(command);
                return (
                  <li
                    key={index}
                    className="flex flex-col gap-1 rounded-lg border border-border bg-card p-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold">
                        {step.title ?? actionLabel(command)}
                      </span>
                      <span className="rounded-full bg-border/40 px-2 py-0.5 text-[11px] text-muted">
                        {actionLabel(command)}
                      </span>
                      {step.category && (
                        <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[11px] text-accent">
                          {t(`categories.${step.category}`)}
                        </span>
                      )}
                    </div>
                    {target && <p className="text-xs text-muted">{target}</p>}
                    {step.reason && (
                      <p className="text-xs leading-relaxed">
                        <span className="font-medium">{t("reasonLabel")}</span>{" "}
                        {step.reason}
                      </p>
                    )}
                    {step.benefit && (
                      <p className="text-xs leading-relaxed text-muted">
                        <span className="font-medium">{t("benefitLabel")}</span>{" "}
                        {step.benefit}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {feedbackBlock}
        </div>
      )}

      {/* Applied: compact confirmation + feedback stays available. */}
      {appliedState && (
        <div className="flex flex-col gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
          <p role="status" className="text-sm text-emerald-600">
            {t("appliedNote")}
          </p>
          {feedbackBlock}
          <button
            type="button"
            onClick={() => setSuggestion(null)}
            className="self-start rounded-lg border border-border px-3 py-1 text-xs text-muted hover:border-accent hover:text-accent"
          >
            {t("done")}
          </button>
        </div>
      )}
    </section>
  );
}
