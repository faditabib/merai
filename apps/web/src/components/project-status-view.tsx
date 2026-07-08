"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  edlOutputDurationMs,
  type EdlV1,
  type RemovalReason,
  type TranscriptWord,
} from "@merai/core";
import { retryProcessing } from "@/app/actions/projects";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";

const POLL_INTERVAL_MS = 2_500;
const STEPS = ["uploading", "transcribing", "analyzing", "ready"] as const;

export interface ProjectSnapshot {
  id: string;
  title: string;
  status: string;
}

export interface TranscriptSnapshot {
  status: string;
  text: string | null;
  words: TranscriptWord[] | null;
  language_code: string | null;
  provider: string;
  error: string | null;
}

const REMOVAL_STAT_KEYS: Partial<Record<RemovalReason, string>> = {
  filler: "removedFillers",
  silence: "removedSilence",
  "bad-take": "removedBadTakes",
  "false-start": "removedFalseStarts",
};

/**
 * Live pipeline view: polls the project row until it reaches a terminal
 * state (ready/error), then loads the transcript and the AI's first-draft
 * EDL. Removed words render struck-through — the "edit preview" until the
 * Phase 3 editor lands.
 * Polling over Realtime is a deliberate simplicity choice — see DECISIONS.md.
 */
export function ProjectStatusView({
  initialProject,
  initialTranscript,
  initialEdl,
}: {
  initialProject: ProjectSnapshot;
  initialTranscript: TranscriptSnapshot | null;
  initialEdl: EdlV1 | null;
}) {
  const t = useTranslations("project");
  const [project, setProject] = useState(initialProject);
  const [transcript, setTranscript] = useState(initialTranscript);
  const [edl, setEdl] = useState(initialEdl);
  const [retrying, setRetrying] = useState(false);

  const terminal = project.status === "ready" || project.status === "error";

  const loadResults = useCallback(async (projectId: string) => {
    const supabase = createClient();
    const [{ data: transcriptRow }, { data: edlRow }] = await Promise.all([
      supabase
        .from("transcripts")
        .select("status, text, words, language_code, provider, error")
        .eq("project_id", projectId)
        .maybeSingle(),
      supabase
        .from("edl_versions")
        .select("edl")
        .eq("project_id", projectId)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (transcriptRow) setTranscript(transcriptRow as TranscriptSnapshot);
    if (edlRow?.edl) setEdl(edlRow.edl as EdlV1);
  }, []);

  useEffect(() => {
    if (terminal) {
      if (project.status === "ready" && (!transcript?.text || !edl)) {
        void loadResults(project.id);
      }
      return;
    }
    const timer = setInterval(async () => {
      const { data } = await createClient()
        .from("projects")
        .select("id, title, status")
        .eq("id", project.id)
        .maybeSingle();
      if (data) setProject(data as ProjectSnapshot);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [terminal, project.id, project.status, transcript?.text, edl, loadResults]);

  async function onRetry() {
    setRetrying(true);
    const result = await retryProcessing({ projectId: project.id });
    if (result.ok) {
      setProject((p) => ({ ...p, status: "transcribing" }));
      setTranscript(null);
      setEdl(null);
    }
    setRetrying(false);
  }

  const removedWordIds = useMemo(() => {
    const ids = new Set<string>();
    for (const segment of edl?.removed ?? []) {
      for (const id of segment.wordIds ?? []) ids.add(id);
    }
    return ids;
  }, [edl]);

  const removalCounts = useMemo(() => {
    const counts = new Map<RemovalReason, number>();
    for (const segment of edl?.removed ?? []) {
      counts.set(segment.reason, (counts.get(segment.reason) ?? 0) + 1);
    }
    return counts;
  }, [edl]);

  const currentStep = STEPS.indexOf(project.status as (typeof STEPS)[number]);
  const isRtlTranscript = (transcript?.language_code ?? "ar").startsWith("ar");

  return (
    <div className="flex flex-col gap-8">
      {/* Status stepper */}
      <ol className="flex flex-wrap items-center gap-2">
        {STEPS.map((step, index) => {
          const reached = currentStep >= index || project.status === "ready";
          const active = currentStep === index && project.status !== "ready";
          return (
            <li key={step} className="flex items-center gap-2">
              {index > 0 && <span className="w-6 border-t border-border" />}
              <span
                className={`rounded-full px-3 py-1 text-sm ${
                  active
                    ? "animate-pulse bg-accent text-accent-foreground"
                    : reached
                      ? "bg-accent/15 text-accent"
                      : "bg-border/40 text-muted"
                }`}
              >
                {t(`steps.${step}`)}
              </span>
            </li>
          );
        })}
      </ol>

      {!terminal && <p className="text-sm text-muted">{t("processingHint")}</p>}

      {project.status === "error" && (
        <div className="flex flex-col gap-3 rounded-2xl border border-red-500/40 bg-red-500/5 p-6">
          <h2 className="font-semibold text-red-500">{t("errorTitle")}</h2>
          <p className="text-sm text-muted">{t("errorBody")}</p>
          <button
            type="button"
            onClick={() => void onRetry()}
            disabled={retrying}
            className="self-start rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50"
          >
            {t("retry")}
          </button>
        </div>
      )}

      {project.status === "ready" && transcript && !transcript.text && (
        <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted">
          {t("emptyTranscript")}
        </p>
      )}

      {project.status === "ready" && transcript?.text && (
        <section className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-semibold">{t("transcriptTitle")}</h2>
            {edl && (
              <Link
                href={`/dashboard/projects/${project.id}/edit`}
                className="rounded-xl bg-accent px-4 py-1.5 text-sm font-semibold text-accent-foreground transition hover:opacity-90"
              >
                {t("openEditor")}
              </Link>
            )}
            {transcript.words && (
              <span className="text-sm text-muted">
                {t("wordCount", { count: transcript.words.length })}
              </span>
            )}
            {transcript.provider === "mock" && (
              <span className="rounded-full bg-amber-500/15 px-3 py-1 text-xs font-medium text-amber-600">
                {t("mockBadge")}
              </span>
            )}
          </div>

          {edl && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded-full bg-accent/15 px-3 py-1 font-medium text-accent">
                {t("edit.keptDuration", {
                  seconds: Math.round(edlOutputDurationMs(edl) / 1000),
                })}
              </span>
              {[...removalCounts.entries()].map(([reason, count]) => {
                const key = REMOVAL_STAT_KEYS[reason];
                if (!key) return null;
                return (
                  <span
                    key={reason}
                    className="rounded-full bg-border/40 px-3 py-1 text-muted"
                  >
                    {t(`edit.${key}`, { count })}
                  </span>
                );
              })}
            </div>
          )}

          <article
            dir={isRtlTranscript ? "rtl" : "ltr"}
            className="rounded-2xl border border-border bg-card p-6 leading-loose"
          >
            {transcript.words && edl
              ? transcript.words.map((word) => (
                  <span key={word.id}>
                    <span
                      className={
                        removedWordIds.has(word.id)
                          ? "text-muted line-through opacity-60"
                          : undefined
                      }
                    >
                      {word.text}
                    </span>{" "}
                  </span>
                ))
              : transcript.text}
          </article>

          {edl && <p className="text-xs text-muted">{t("edit.legend")}</p>}
        </section>
      )}
    </div>
  );
}
