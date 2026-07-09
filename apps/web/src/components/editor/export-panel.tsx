"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  CAPTION_STYLE_SPECS,
  DEFAULT_CAPTION_STYLE,
  type AspectRatio,
  type CaptionStyleToken,
  type EdlV1,
  type TranscriptWord,
} from "@merai/core";
import { createClient } from "@/lib/supabase/client";
import { renderCaptionImages } from "@/lib/export/caption-images";
import { buildExportPlan } from "@/lib/export/plan";
import { renderExport } from "@/lib/export/renderer";

const RAW_BUCKET = "raw-uploads";
const EXPORTS_BUCKET = "exports";
const ASPECT_RATIOS: AspectRatio[] = ["9:16", "1:1", "16:9"];

type Stage =
  | "idle"
  | "saving"
  | "loading"
  | "downloading"
  | "captions"
  | "rendering"
  | "uploading"
  | "done"
  | "error";

const ACTIVE_STAGES: Stage[] = [
  "saving",
  "loading",
  "downloading",
  "captions",
  "rendering",
  "uploading",
];

interface ExportRow {
  id: string;
  status: string;
  aspect_ratio: string;
  caption_style: string;
  storage_path: string | null;
  size_bytes: number | null;
  created_at: string;
}

export interface ExportPanelProps {
  projectId: string;
  ownerId: string;
  storagePath: string;
  languageCode: string | null;
  edl: EdlV1;
  words: TranscriptWord[];
  onChangeAspect: (ratio: AspectRatio) => void;
  /** Saves the working EDL if dirty; resolves to the edl_version id. */
  ensureSavedVersion: () => Promise<string | null>;
}

/**
 * Client-side export: ffmpeg.wasm renders the saved EDL + burned captions at
 * the chosen aspect ratio, then uploads to the private exports bucket for
 * re-download (90-day retention).
 */
export function ExportPanel(props: ExportPanelProps) {
  const t = useTranslations("export");
  const [stage, setStage] = useState<Stage>("idle");
  const [progress, setProgress] = useState(0);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [previous, setPrevious] = useState<ExportRow[]>([]);

  const refreshList = useCallback(async () => {
    const { data } = await createClient()
      .from("exports")
      .select("id, status, aspect_ratio, caption_style, storage_path, size_bytes, created_at")
      .eq("project_id", props.projectId)
      .order("created_at", { ascending: false })
      .limit(10);
    if (data) setPrevious(data as ExportRow[]);
  }, [props.projectId]);

  useEffect(() => {
    void refreshList();
  }, [refreshList]);

  // Never lose a render to an accidental tab close.
  useEffect(() => {
    if (!ACTIVE_STAGES.includes(stage)) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [stage]);

  async function startExport() {
    const supabase = createClient();
    let exportId: string | null = null;
    setBlobUrl(null);
    setProgress(0);

    try {
      setStage("saving");
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
          status: "rendering",
        })
        .select("id")
        .single();
      if (createError || !created) throw createError ?? new Error("insert failed");
      exportId = created.id as string;

      const plan = buildExportPlan({ edl: props.edl, words: props.words });

      setStage("captions");
      const spec =
        CAPTION_STYLE_SPECS[props.edl.captionStyle as CaptionStyleToken] ??
        CAPTION_STYLE_SPECS[DEFAULT_CAPTION_STYLE];
      const captionImages = await renderCaptionImages(
        plan.captions,
        spec,
        plan.width,
        plan.height,
        (props.languageCode ?? "ar").startsWith("ar"),
      );

      const objectName = props.storagePath.slice(RAW_BUCKET.length + 1);
      const { data: signed, error: signError } = await supabase.storage
        .from(RAW_BUCKET)
        .createSignedUrl(objectName, 3600);
      if (signError || !signed) throw signError ?? new Error("sign failed");

      const bytes = await renderExport({
        videoUrl: signed.signedUrl,
        plan,
        captionImages,
        onStage: setStage,
        onProgress: setProgress,
      });

      setStage("uploading");
      const objectPath = `${props.ownerId}/${exportId}.mp4`;
      const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "video/mp4" });
      const { error: uploadError } = await supabase.storage
        .from(EXPORTS_BUCKET)
        .upload(objectPath, blob, { contentType: "video/mp4", upsert: true });
      if (uploadError) throw uploadError;

      await supabase
        .from("exports")
        .update({
          status: "uploaded",
          storage_path: `${EXPORTS_BUCKET}/${objectPath}`,
          size_bytes: bytes.length,
          duration_seconds: plan.outputDurationMs / 1000,
        })
        .eq("id", exportId);

      setBlobUrl(URL.createObjectURL(blob));
      setStage("done");
      void refreshList();
    } catch (err) {
      console.error("export failed", err);
      if (exportId) {
        await supabase
          .from("exports")
          .update({ status: "failed", error: err instanceof Error ? err.message : "unknown" })
          .eq("id", exportId);
      }
      setStage("error");
      void refreshList();
    }
  }

  async function downloadPrevious(row: ExportRow) {
    if (!row.storage_path) return;
    const objectName = row.storage_path.slice(EXPORTS_BUCKET.length + 1);
    const { data } = await createClient()
      .storage.from(EXPORTS_BUCKET)
      .createSignedUrl(objectName, 600, { download: true });
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  }

  const busy = ACTIVE_STAGES.includes(stage);

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

      {busy && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-sm">
            <span>
              {stage === "rendering"
                ? t("stages.rendering", { percent: Math.round(progress * 100) })
                : t(`stages.${stage}`)}
            </span>
            <span className="text-xs text-red-500">{t("closeWarning")}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-border">
            <div
              className="h-full rounded-full bg-accent transition-all"
              style={{
                width: `${stage === "rendering" ? Math.round(progress * 100) : stage === "uploading" ? 95 : 10}%`,
              }}
            />
          </div>
        </div>
      )}

      {stage === "done" && blobUrl && (
        <p className="flex items-center gap-3 rounded-xl bg-accent/10 p-3 text-sm">
          <span className="font-medium text-accent">{t("done")}</span>
          <a
            href={blobUrl}
            download="merai-export.mp4"
            className="rounded-lg bg-accent px-4 py-1.5 font-semibold text-accent-foreground"
          >
            {t("download")}
          </a>
        </p>
      )}
      {stage === "error" && (
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
                    onClick={() => void downloadPrevious(row)}
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
