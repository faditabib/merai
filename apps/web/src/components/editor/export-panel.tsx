"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { AspectRatio, EdlV1 } from "@merai/core";
import { requestExportRender } from "@/app/actions/projects";
import { createClient } from "@/lib/supabase/client";

const EXPORTS_BUCKET = "exports";
const ASPECT_RATIOS: AspectRatio[] = ["9:16", "1:1", "16:9"];
const POLL_INTERVAL_MS = 2_500;
const ACTIVE_STATUSES = ["pending", "rendering"];

interface ExportRow {
  id: string;
  status: string;
  progress: number | string;
  cancel_requested: boolean;
  aspect_ratio: string;
  storage_path: string | null;
  size_bytes: number | null;
  created_at: string;
}

export interface ExportPanelProps {
  projectId: string;
  ownerId: string;
  edl: EdlV1;
  onChangeAspect: (ratio: AspectRatio) => void;
  /** Saves the working EDL if dirty; resolves to the edl_version id. */
  ensureSavedVersion: () => Promise<string | null>;
}

/**
 * Server-side export (Phase 4.5): "request export" fires a render_export job
 * on the worker; this panel just polls the exports row for status/progress —
 * the same pattern as transcription. The user can close the tab; the render
 * continues on the server.
 */
export function ExportPanel(props: ExportPanelProps) {
  const t = useTranslations("export");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [active, setActive] = useState<ExportRow | null>(null);
  const [starting, setStarting] = useState(false);
  const [requestError, setRequestError] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [previous, setPrevious] = useState<ExportRow[]>([]);
  const listStale = useRef(false);

  const refreshList = useCallback(async () => {
    const { data } = await createClient()
      .from("exports")
      .select(
        "id, status, progress, cancel_requested, aspect_ratio, storage_path, size_bytes, created_at",
      )
      .eq("project_id", props.projectId)
      .order("created_at", { ascending: false })
      .limit(10);
    if (data) setPrevious(data as ExportRow[]);
  }, [props.projectId]);

  useEffect(() => {
    void refreshList();
  }, [refreshList]);

  // Poll the active export until it reaches a terminal state.
  useEffect(() => {
    if (!activeId) return;
    const timer = setInterval(async () => {
      const { data } = await createClient()
        .from("exports")
        .select(
          "id, status, progress, cancel_requested, aspect_ratio, storage_path, size_bytes, created_at",
        )
        .eq("id", activeId)
        .maybeSingle();
      if (!data) return;
      const row = data as ExportRow;
      setActive(row);
      if (!ACTIVE_STATUSES.includes(row.status)) {
        clearInterval(timer);
        setActiveId(null);
        setCancelling(false);
        void refreshList();
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [activeId, refreshList]);

  async function startExport() {
    const supabase = createClient();
    setStarting(true);
    setRequestError(false);
    setActive(null);
    try {
      const versionId = await props.ensureSavedVersion();
      if (!versionId) throw new Error("save failed");

      const { data: created, error: createError } = await supabase
        .from("exports")
        .insert({
          project_id: props.projectId,
          owner_id: props.ownerId,
          edl_version_id: versionId,
          aspect_ratio: props.edl.aspectRatio,
          caption_style: props.edl.captionStyle,
          status: "pending",
        })
        .select("id, status, progress, cancel_requested, aspect_ratio, storage_path, size_bytes, created_at")
        .single();
      if (createError || !created) throw createError ?? new Error("insert failed");

      const queued = await requestExportRender({ exportId: created.id as string });
      if (!queued.ok) throw new Error(queued.error);

      setActive(created as ExportRow);
      setActiveId(created.id as string);
      listStale.current = true;
    } catch (err) {
      console.error("export request failed", err);
      setRequestError(true);
    } finally {
      setStarting(false);
    }
  }

  async function cancelActive() {
    if (!activeId) return;
    setCancelling(true);
    await createClient()
      .from("exports")
      .update({ cancel_requested: true })
      .eq("id", activeId);
    // The worker flips status to 'cancelled' at the next checkpoint.
  }

  async function download(row: ExportRow) {
    if (!row.storage_path) return;
    const objectName = row.storage_path.slice(EXPORTS_BUCKET.length + 1);
    const { data } = await createClient()
      .storage.from(EXPORTS_BUCKET)
      .createSignedUrl(objectName, 600, { download: true });
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  }

  const busy = starting || activeId !== null;
  const progressPct = active ? Math.round(Number(active.progress) * 100) : 0;

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-semibold">{t("title")}</h2>
        <span className="text-sm text-muted">{t("aspect")}</span>
        {ASPECT_RATIOS.map((ratio) => (
          <button
            key={ratio}
            type="button"
            disabled={busy}
            onClick={() => props.onChangeAspect(ratio)}
            className={`rounded-lg border px-3 py-1 text-sm tabular-nums ${
              props.edl.aspectRatio === ratio
                ? "border-accent bg-accent/15 text-accent"
                : "border-border text-muted hover:border-accent"
            }`}
            dir="ltr"
          >
            {ratio} {t(`aspectNames.${ratio.replace(":", "x")}`)}
          </button>
        ))}
        <button
          type="button"
          onClick={() => void startExport()}
          disabled={busy}
          className="ms-auto rounded-xl bg-accent px-5 py-2 font-semibold text-accent-foreground disabled:opacity-50"
        >
          {t("start")}
        </button>
      </div>

      {busy && active && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span>
              {cancelling
                ? t("cancelling")
                : active.status === "pending"
                  ? t("stages.pending")
                  : t("stages.rendering", { percent: progressPct })}
            </span>
            <span className="ms-auto text-xs text-muted">{t("serverNote")}</span>
            <button
              type="button"
              onClick={() => void cancelActive()}
              disabled={cancelling}
              className="rounded-lg border border-border px-3 py-1 text-xs text-muted hover:border-red-500 hover:text-red-500 disabled:opacity-50"
            >
              {t("cancel")}
            </button>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-border">
            <div
              className={`h-full rounded-full bg-accent transition-all ${
                active.status === "pending" ? "w-[4%] animate-pulse" : ""
              }`}
              style={active.status === "rendering" ? { width: `${progressPct}%` } : undefined}
            />
          </div>
        </div>
      )}

      {!busy && active?.status === "uploaded" && (
        <p className="flex items-center gap-3 rounded-xl bg-accent/10 p-3 text-sm">
          <span className="font-medium text-accent">{t("done")}</span>
          <button
            type="button"
            onClick={() => void download(active)}
            className="rounded-lg bg-accent px-4 py-1.5 font-semibold text-accent-foreground"
          >
            {t("download")}
          </button>
        </p>
      )}
      {!busy && active?.status === "cancelled" && (
        <p className="text-sm text-muted">{t("cancelledNote")}</p>
      )}
      {((!busy && active?.status === "failed") || requestError) && (
        <p role="alert" className="text-sm text-red-500">
          {t("error")}
        </p>
      )}

      {previous.length > 0 && (
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-medium text-muted">{t("previous")}</h3>
          <ul className="flex flex-col divide-y divide-border">
            {previous.map((row) => (
              <li key={row.id} className="flex items-center gap-3 py-2 text-sm">
                <span dir="ltr" className="tabular-nums">
                  {row.aspect_ratio}
                </span>
                <span className="text-muted">
                  {t(`statuses.${row.status}`)}
                  {row.size_bytes
                    ? ` — ${(row.size_bytes / 1024 / 1024).toFixed(1)}MB`
                    : ""}
                </span>
                {row.status === "uploaded" && (
                  <button
                    type="button"
                    onClick={() => void download(row)}
                    className="ms-auto rounded-lg border border-border px-3 py-1 text-xs hover:border-accent hover:text-accent"
                  >
                    {t("download")}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
