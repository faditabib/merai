"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { TranscriptWord } from "@merai/core";
import { retryProcessing } from "@/app/actions/projects";
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

/**
 * Live pipeline view: polls the project row until it reaches a terminal
 * state (ready/error), then loads and renders the transcript.
 * Polling over Realtime is a deliberate simplicity choice — see DECISIONS.md.
 */
export function ProjectStatusView({
  initialProject,
  initialTranscript,
}: {
  initialProject: ProjectSnapshot;
  initialTranscript: TranscriptSnapshot | null;
}) {
  const t = useTranslations("project");
  const [project, setProject] = useState(initialProject);
  const [transcript, setTranscript] = useState(initialTranscript);
  const [retrying, setRetrying] = useState(false);

  const terminal = project.status === "ready" || project.status === "error";

  const loadTranscript = useCallback(async (projectId: string) => {
    const { data } = await createClient()
      .from("transcripts")
      .select("status, text, words, language_code, provider, error")
      .eq("project_id", projectId)
      .maybeSingle();
    if (data) setTranscript(data as TranscriptSnapshot);
  }, []);

  useEffect(() => {
    if (terminal) {
      if (project.status === "ready" && !transcript?.text) {
        void loadTranscript(project.id);
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
  }, [terminal, project.id, project.status, transcript?.text, loadTranscript]);

  async function onRetry() {
    setRetrying(true);
    const result = await retryProcessing({ projectId: project.id });
    if (result.ok) {
      setProject((p) => ({ ...p, status: "transcribing" }));
      setTranscript(null);
    }
    setRetrying(false);
  }

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

      {project.status === "ready" && transcript?.text && (
        <section className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-semibold">{t("transcriptTitle")}</h2>
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
          <article
            dir={isRtlTranscript ? "rtl" : "ltr"}
            className="rounded-2xl border border-border bg-card p-6 leading-loose"
          >
            {transcript.text}
          </article>
        </section>
      )}
    </div>
  );
}
