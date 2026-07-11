"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  MAX_AI_INSTRUCTION_CHARS,
  parseStoredAiCommands,
  type EditCommand,
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
  explanation: string | null;
  error: string | null;
}

const PRESET_KEYS = ["shorter", "engaging", "tiktok"] as const;

/**
 * AI Re-Edit Assistant (Build 5.5). The creator states a goal; the worker's
 * Brain answers with a VALIDATED command plan; nothing touches the working
 * EDL until the creator clicks Apply — which routes the batch through the
 * editor's normal command dispatcher as ONE undoable step.
 *
 * The request pins the saved EDL version (auto-saving first via
 * ensureSavedVersion, the export panel's pattern). If the editor moves past
 * that version before Apply, the suggestion is marked stale and Apply is
 * disabled — v1 is deliberately conservative.
 */
export function AiAssistantPanel(props: {
  projectId: string;
  ownerId: string;
  savedVersionId: string;
  dirty: boolean;
  ensureSavedVersion: () => Promise<string | null>;
  onApplyCommands: (commands: EditCommand[]) => void;
}) {
  const t = useTranslations("editor.aiAssistant");
  const supabase = useRef(createClient()).current;

  const [instruction, setInstruction] = useState("");
  const [suggestion, setSuggestion] = useState<SuggestionRow | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [requestError, setRequestError] = useState(false);
  const [applied, setApplied] = useState(false);

  const working =
    requesting ||
    suggestion?.status === "pending" ||
    suggestion?.status === "processing";

  // Poll the suggestion row while the Brain works (house polling pattern).
  useEffect(() => {
    if (!suggestion || !["pending", "processing"].includes(suggestion.status)) {
      return;
    }
    const timer = setInterval(async () => {
      const { data } = await supabase
        .from("ai_suggestions")
        .select("id, status, edl_version_id, goal, commands, explanation, error")
        .eq("id", suggestion.id)
        .maybeSingle();
      if (data) setSuggestion(data as SuggestionRow);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [suggestion, supabase]);

  const request = useCallback(
    async (text: string) => {
      const trimmed = text.trim().slice(0, MAX_AI_INSTRUCTION_CHARS);
      if (!trimmed || working) return;
      setRequesting(true);
      setRequestError(false);
      setApplied(false);
      setSuggestion(null);
      try {
        // Pin the plan to a persisted version (auto-save if dirty).
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
          .select("id, status, edl_version_id, goal, commands, explanation, error")
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

  const markStatus = useCallback(
    (status: "applied" | "dismissed") => {
      if (!suggestion) return;
      void supabase
        .from("ai_suggestions")
        .update({ status })
        .eq("id", suggestion.id)
        .then(() => undefined);
    },
    [suggestion, supabase],
  );

  const ready = suggestion?.status === "ready";
  // Conservative staleness guard: the plan was validated against the pinned
  // saved version — any newer save or unsaved edit invalidates Apply.
  const stale =
    ready && (props.dirty || suggestion!.edl_version_id !== props.savedVersionId);
  const commands: EditCommand[] = ready
    ? (() => {
        try {
          return parseStoredAiCommands(suggestion!.commands);
        } catch {
          return [];
        }
      })()
    : [];

  const apply = () => {
    if (!ready || stale) return;
    props.onApplyCommands(commands);
    setApplied(true);
    markStatus("applied");
    setSuggestion(null);
  };

  const dismiss = () => {
    markStatus("dismissed");
    setSuggestion(null);
  };

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-semibold">{t("title")}</h2>
        <span className="text-xs text-muted">{t("subtitle")}</span>
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
      {applied && (
        <p role="status" className="text-sm text-emerald-600">
          {t("appliedNote")}
        </p>
      )}

      {suggestion?.status === "failed" && (
        <p role="alert" className="text-sm text-red-500">
          {suggestion.error === "ai-unavailable"
            ? t("errors.ai-unavailable")
            : t("errors.generic")}
        </p>
      )}

      {ready && (
        <div className="flex flex-col gap-3 rounded-xl border border-accent/30 bg-accent/5 p-4">
          <p className="text-sm leading-relaxed">{suggestion!.explanation}</p>
          <p className="text-xs text-muted">
            {t("commandCount", { count: commands.length })}
          </p>
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
              onClick={dismiss}
              className="rounded-lg border border-border px-4 py-1.5 text-sm text-muted hover:border-accent hover:text-accent"
            >
              {t("dismiss")}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
