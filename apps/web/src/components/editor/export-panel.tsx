"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  hueName,
  resolveCaptionSpec,
  CAPTION_PRESET_IDS,
  type AspectRatio,
  type BrandExportConfig,
  type CaptionBrandColors,
  type CaptionStyleSpec,
  type EdlV1,
} from "@merai/core";
import { requestExportRender } from "@/app/actions/projects";
import { Link } from "@/i18n/navigation";
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
  parts: number;
  created_at: string;
}

const EXPORT_ROW_COLUMNS =
  "id, status, progress, cancel_requested, aspect_ratio, storage_path, size_bytes, parts, created_at";

export interface ExportPanelProps {
  projectId: string;
  ownerId: string;
  edl: EdlV1;
  /** The working caption spec to render (Build 6B.3). */
  captionSpec: CaptionStyleSpec;
  /** Owner's Brand Kit as an export snapshot; null = nothing to apply. */
  brandConfig: BrandExportConfig | null;
  /** Brand colors for brand-* caption presets; null = no kit. */
  brandColors: CaptionBrandColors | null;
  /** Brand kit name for the "your video style" card; null = no kit. */
  brandName: string | null;
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
  const tc = useTranslations("captionStudio");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [active, setActive] = useState<ExportRow | null>(null);
  const [starting, setStarting] = useState(false);
  const [requestError, setRequestError] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [previous, setPrevious] = useState<ExportRow[]>([]);
  /** Export id whose multi-part download is being reassembled client-side. */
  const [assembling, setAssembling] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState(false);
  const listStale = useRef(false);
  // "Branding" covers overlays (brandConfig) and brand-colored captions
  // (brandColors) — offer the toggle if the kit provides either.
  const hasBranding = props.brandConfig != null || props.brandColors != null;
  const [applyBranding, setApplyBranding] = useState(hasBranding);

  const refreshList = useCallback(async () => {
    const { data } = await createClient()
      .from("exports")
      .select(EXPORT_ROW_COLUMNS)
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
        .select(EXPORT_ROW_COLUMNS)
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
          caption_style: props.captionSpec.token,
          // Snapshot the branding so later Brand Kit edits never change a
          // render that already happened (same as aspect/caption columns).
          brand: applyBranding ? props.brandConfig : null,
          // Snapshot the resolved working caption spec (Build 6B.3) — carries
          // studio tweaks + brand color; the worker renders it verbatim.
          caption_config: resolveCaptionSpec(
            props.captionSpec,
            applyBranding ? props.brandColors : null,
          ),
          status: "pending",
        })
        .select(EXPORT_ROW_COLUMNS)
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
    if (!row.storage_path || assembling) return;
    const objectName = row.storage_path.slice(EXPORTS_BUCKET.length + 1);
    const storage = createClient().storage.from(EXPORTS_BUCKET);

    if (!row.parts || row.parts <= 1) {
      const { data } = await storage.createSignedUrl(objectName, 600, { download: true });
      if (data?.signedUrl) window.open(data.signedUrl, "_blank");
      return;
    }

    // Over-cap outputs are stored as .partN objects (see the worker's
    // render_export fallback); reassemble them into one file here.
    setAssembling(row.id);
    setDownloadError(false);
    try {
      const blobs: Blob[] = [];
      for (let i = 0; i < row.parts; i++) {
        const { data, error } = await storage.createSignedUrl(`${objectName}.part${i}`, 600);
        if (error || !data?.signedUrl) throw error ?? new Error("sign failed");
        const res = await fetch(data.signedUrl);
        if (!res.ok) throw new Error(`part ${i}: HTTP ${res.status}`);
        blobs.push(await res.blob());
      }
      const url = URL.createObjectURL(new Blob(blobs, { type: "video/mp4" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `merai-export-${row.id}.mp4`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("multi-part download failed", err);
      setDownloadError(true);
    } finally {
      setAssembling(null);
    }
  }

  const busy = starting || activeId !== null;
  const progressPct = active ? Math.round(Number(active.progress) * 100) : 0;
  const isPreset = (CAPTION_PRESET_IDS as readonly string[]).includes(
    props.captionSpec.token,
  );
  const captionLabel = isPreset
    ? tc(`presets.${props.captionSpec.token}`)
    : t("styleCard.customCaption");

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

      {/* Branding (Build 6B.1): apply the creator's Brand Kit to this export. */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">{t("branding")}</span>
        {hasBranding ? (
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={applyBranding}
              disabled={busy}
              onChange={(e) => setApplyBranding(e.target.checked)}
            />
            <span>{t("applyBranding")}</span>
            <span className="text-xs text-muted">{t("brandingHint")}</span>
          </label>
        ) : (
          <span className="flex items-center gap-2 text-muted">
            {t("brandingNone")}
            <Link
              href="/dashboard/brand-kit"
              className="text-accent hover:underline"
            >
              {t("brandingSetup")}
            </Link>
          </span>
        )}
      </div>

      {/* "Your video style" card (Build 6B.3): confidence before rendering. */}
      <div className="flex flex-col gap-2 rounded-xl border border-border bg-background/40 p-3">
        <span className="text-xs font-medium text-muted">{t("styleCard.title")}</span>
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-xs text-muted">{t("styleCard.caption")}</span>
            <span className="truncate font-medium">{captionLabel}</span>
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-xs text-muted">{t("styleCard.brand")}</span>
            {applyBranding && props.brandName && props.brandColors ? (
              <span className="flex items-center gap-1.5 truncate font-medium">
                <span
                  className="h-3 w-3 shrink-0 rounded-full border border-border"
                  style={{ backgroundColor: props.brandColors.accent }}
                />
                <span className="truncate">
                  {props.brandName} {tc(`colorNames.${hueName(props.brandColors.accent)}`)}
                </span>
              </span>
            ) : (
              <span className="text-muted">{t("styleCard.noBrand")}</span>
            )}
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-xs text-muted">{t("styleCard.format")}</span>
            <span className="font-medium tabular-nums" dir="ltr">
              {props.edl.aspectRatio}
            </span>
          </div>
        </div>
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
            disabled={assembling !== null}
            className="rounded-lg bg-accent px-4 py-1.5 font-semibold text-accent-foreground disabled:opacity-50"
          >
            {assembling === active.id ? t("assembling") : t("download")}
          </button>
        </p>
      )}
      {downloadError && (
        <p role="alert" className="text-sm text-red-500">
          {t("downloadFailed")}
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
                    disabled={assembling !== null}
                    className="ms-auto rounded-lg border border-border px-3 py-1 text-xs hover:border-accent hover:text-accent disabled:opacity-50"
                  >
                    {assembling === row.id ? t("assembling") : t("download")}
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
