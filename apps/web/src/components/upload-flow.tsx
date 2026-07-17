"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { completeUpload, createProjectWithUpload } from "@/app/actions/projects";
import { Link, useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import { probeVideoDurationSeconds } from "@/lib/upload/probe";
import {
  createResumableUpload,
  supabaseTusEndpoint,
  type ResumableUploadHandle,
} from "@/lib/upload/tus-uploader";
import { validateVideoFile } from "@/lib/upload/validate";

type UploadState =
  | "idle"
  | "probing"
  | "starting"
  | "uploading"
  | "paused"
  | "finalizing"
  | "error";

export interface UploadFlowProps {
  /** Build 7.1: a file supplied by another surface (the recorder). When set,
   *  the flow auto-starts and the dropzone is never shown. */
  externalFile?: File | null;
  /** UX sprint: lets the host surface offer its own recovery on failure. */
  onError?: () => void;
}

/**
 * Full client-side upload flow: duration probe → project/upload creation →
 * resumable tus upload with pause/resume/cancel → finalize (enqueues
 * transcription) → navigate to the project page.
 */
export function UploadFlow(props: UploadFlowProps = {}) {
  const t = useTranslations("upload");
  const router = useRouter();

  const [state, setState] = useState<UploadState>("idle");
  const [progress, setProgress] = useState(0);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const handleRef = useRef<ResumableUploadHandle | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Warn before leaving the page while bytes are in flight.
  useEffect(() => {
    if (state !== "uploading" && state !== "finalizing") return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [state]);

  // Externally-supplied file (recorder handoff): start once per file.
  const startedExternal = useRef<File | null>(null);
  useEffect(() => {
    const file = props.externalFile;
    if (file && startedExternal.current !== file) {
      startedExternal.current = file;
      void handleFile(file);
    }
    // handleFile is stable in practice (no reactive deps beyond setters).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.externalFile]);

  function fail(key: string) {
    setState("error");
    setErrorKey(key);
    props.onError?.();
  }

  async function handleFile(file: File) {
    setErrorKey(null);
    setFileName(file.name);
    setProgress(0);
    setState("probing");

    const durationSeconds = await probeVideoDurationSeconds(file);
    const validationError = validateVideoFile({
      mimeType: file.type,
      sizeBytes: file.size,
      durationSeconds,
    });
    if (validationError) return fail(validationError);

    setState("starting");
    const created = await createProjectWithUpload({
      title: file.name.replace(/\.[^.]+$/, ""),
      filename: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      durationSeconds,
    });
    if (!created.ok || !created.projectId || !created.uploadId) {
      return fail(created.error ?? "create-failed");
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) return fail("create-failed");
    const {
      data: { session },
    } = await createClient().auth.getSession();
    if (!session) return fail("not-authenticated");

    const handle = createResumableUpload({
      endpoint: supabaseTusEndpoint(supabaseUrl),
      accessToken: session.access_token,
      bucket: created.bucket!,
      objectName: created.objectName!,
      contentType: file.type,
      file,
      onProgress: (sent, total) =>
        setProgress(total ? Math.round((sent / total) * 100) : 0),
      onError: () => fail("upload-failed"),
      onSuccess: async () => {
        setState("finalizing");
        const done = await completeUpload({ uploadId: created.uploadId! });
        if (!done.ok) return fail(done.error ?? "update-failed");
        router.push(`/dashboard/projects/${created.projectId}`);
      },
    });

    handleRef.current = handle;
    setState("uploading");
    handle.start();
  }

  async function pause() {
    await handleRef.current?.pause();
    setState("paused");
  }

  function resume() {
    handleRef.current?.resume();
    setState("uploading");
  }

  async function cancel() {
    await handleRef.current?.cancel();
    handleRef.current = null;
    setState("idle");
    setProgress(0);
    setFileName("");
  }

  const busy = state === "probing" || state === "starting";
  const transferring =
    state === "uploading" || state === "paused" || state === "finalizing";

  if (state === "idle" || state === "error" || busy) {
    // Recorder handoff: no dropzone — just status/errors while starting.
    if (props.externalFile) {
      return (
        <div className="flex flex-col gap-4">
          {state === "error" && errorKey ? (
            <div className="flex flex-col gap-2 rounded-xl border border-red-500/40 bg-red-500/5 p-4">
              <p role="alert" className="text-sm text-red-500">
                {t(`errors.${errorKey}`)}
              </p>
              {errorKey === "quota-exceeded" && (
                <Link
                  href="/dashboard/billing"
                  className="w-fit rounded-lg bg-accent px-4 py-1.5 text-sm font-semibold text-accent-foreground transition hover:opacity-90"
                >
                  {t("goToBilling")}
                </Link>
              )}
            </div>
          ) : (
            <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted">
              {t(state === "probing" ? "probing" : "starting")}
            </p>
          )}
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-4">
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files[0];
            if (file && !busy) void handleFile(file);
          }}
          className={`flex min-h-56 cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-10 text-center transition ${
            dragOver ? "border-accent bg-accent/5" : "border-border"
          } ${busy ? "pointer-events-none opacity-60" : ""}`}
        >
          <span className="text-lg font-semibold">
            {busy ? t(state === "probing" ? "probing" : "starting") : t("dropTitle")}
          </span>
          <span className="text-sm text-muted">{t("dropHint")}</span>
          <input
            ref={inputRef}
            type="file"
            accept="video/mp4,video/quicktime,video/webm,video/x-matroska"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
              e.target.value = "";
            }}
          />
        </label>

        {state === "error" && errorKey && (
          <div className="flex flex-col gap-2 rounded-xl border border-red-500/40 bg-red-500/5 p-4">
            <p role="alert" className="text-sm text-red-500">
              {t(`errors.${errorKey}`)}
            </p>
            {errorKey === "quota-exceeded" && (
              <Link
                href="/dashboard/billing"
                className="w-fit rounded-lg bg-accent px-4 py-1.5 text-sm font-semibold text-accent-foreground transition hover:opacity-90"
              >
                {t("goToBilling")}
              </Link>
            )}
          </div>
        )}
      </div>
    );
  }

  if (transferring) {
    return (
      <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center justify-between gap-4">
          <span className="truncate text-sm font-medium" dir="ltr">
            {fileName}
          </span>
          <span className="text-sm tabular-nums text-muted">{progress}%</span>
        </div>

        <div
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-2 overflow-hidden rounded-full bg-border"
        >
          <div
            className="h-full rounded-full bg-accent transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>

        <p className="text-sm text-muted">
          {state === "finalizing"
            ? t("finalizing")
            : state === "paused"
              ? t("paused")
              : t("uploading")}{" "}
          — {t("closeWarning")}
        </p>

        {state !== "finalizing" && (
          <div className="flex gap-3">
            {state === "uploading" ? (
              <button
                type="button"
                onClick={() => void pause()}
                className="rounded-lg border border-border px-4 py-2 text-sm hover:border-accent"
              >
                {t("pause")}
              </button>
            ) : (
              <button
                type="button"
                onClick={resume}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground"
              >
                {t("resume")}
              </button>
            )}
            <button
              type="button"
              onClick={() => void cancel()}
              className="rounded-lg border border-border px-4 py-2 text-sm text-muted hover:border-red-500 hover:text-red-500"
            >
              {t("cancel")}
            </button>
          </div>
        )}
      </div>
    );
  }

  return null;
}
