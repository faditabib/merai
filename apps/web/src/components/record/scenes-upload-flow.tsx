"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { createProjectWithScenes, finalizeScenes } from "@/app/actions/projects";
import { Link, useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  createResumableUpload,
  supabaseTusEndpoint,
} from "@/lib/upload/tus-uploader";

export interface SceneFile {
  file: File;
  durationSeconds: number;
}

export interface ScenesUploadFlowProps {
  title: string;
  scenes: SceneFile[];
}

type State = "starting" | "uploading" | "finalizing" | "error";

/**
 * Multi-scene handoff (Build 7.4): create the project + rows, tus-upload
 * each scene SEQUENTIALLY (bounded memory/connections), finalize (enqueues
 * the worker stitch), then land on the project page — where the normal
 * status view tracks stitch → transcribe → analyze.
 * Reuses the shared tus lib, not a copy of UploadFlow.
 */
export function ScenesUploadFlow(props: ScenesUploadFlowProps) {
  const t = useTranslations("record.scenes");
  const tu = useTranslations("upload");
  const router = useRouter();

  const [state, setState] = useState<State>("starting");
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [current, setCurrent] = useState(0);
  const [progress, setProgress] = useState(0);
  const started = useRef(false);

  // Warn before leaving while bytes are in flight.
  useEffect(() => {
    if (state !== "uploading" && state !== "finalizing") return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [state]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void run();
    // Mount-once by design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run() {
    const fail = (key: string) => {
      setState("error");
      setErrorKey(key);
    };

    const created = await createProjectWithScenes({
      title: props.title,
      scenes: props.scenes.map((s) => ({
        filename: s.file.name,
        mimeType: s.file.type,
        sizeBytes: s.file.size,
        durationSeconds: s.durationSeconds,
      })),
    });
    if (!created.ok || !created.projectId || !created.scenes) {
      return fail(created.error ?? "create-failed");
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) return fail("create-failed");
    const {
      data: { session },
    } = await createClient().auth.getSession();
    if (!session) return fail("not-authenticated");

    setState("uploading");
    for (let i = 0; i < props.scenes.length; i++) {
      setCurrent(i);
      setProgress(0);
      const scene = props.scenes[i]!;
      const target = created.scenes[i]!;
      const ok = await new Promise<boolean>((resolve) => {
        const handle = createResumableUpload({
          endpoint: supabaseTusEndpoint(supabaseUrl),
          accessToken: session.access_token,
          bucket: created.bucket!,
          objectName: target.objectName,
          contentType: scene.file.type,
          file: scene.file,
          onProgress: (sent, total) =>
            setProgress(total ? Math.round((sent / total) * 100) : 0),
          onError: () => resolve(false),
          onSuccess: () => resolve(true),
        });
        handle.start();
      });
      if (!ok) return fail("upload-failed");
    }

    setState("finalizing");
    const done = await finalizeScenes({
      projectId: created.projectId,
      uploadIds: created.scenes.map((s) => s.uploadId),
      stitchedUploadId: created.stitchedUploadId!,
    });
    if (!done.ok) return fail(done.error ?? "update-failed");
    router.push(`/dashboard/projects/${created.projectId}`);
  }

  if (state === "error" && errorKey) {
    const known = ["scenes-too-few", "scenes-too-long"].includes(errorKey);
    return (
      <div className="flex flex-col gap-2 rounded-xl border border-red-500/40 bg-red-500/5 p-4">
        <p role="alert" className="text-sm text-red-500">
          {known ? t(`errors.${errorKey}`) : tu(`errors.${errorKey}`)}
        </p>
        {errorKey === "quota-exceeded" && (
          <Link
            href="/dashboard/billing"
            className="w-fit rounded-lg bg-accent px-4 py-1.5 text-sm font-semibold text-accent-foreground transition hover:opacity-90"
          >
            {tu("goToBilling")}
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6">
      <span className="text-sm font-medium">
        {state === "finalizing"
          ? t("finalizing")
          : state === "uploading"
            ? t("uploadingScene", { n: current + 1, total: props.scenes.length })
            : tu("starting")}
      </span>
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
      <p className="text-sm text-muted">{tu("closeWarning")}</p>
    </div>
  );
}
