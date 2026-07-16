"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { MAX_RAW_UPLOAD_SECONDS } from "@merai/core";
import {
  containerOfMime,
  formatElapsed,
  pickRecorderMimeType,
  startRecorderSession,
  takeFilename,
  type RecorderSession,
} from "@/lib/record/recorder";
import { UploadFlow } from "@/components/upload-flow";

const DEVICE_STORAGE_KEY = "merai.record.devices";
const COUNTDOWN_SECONDS = 3;
const CAP_MS = MAX_RAW_UPLOAD_SECONDS * 1000;
/** Amber warning zone: the last 60 seconds before the cap. */
const CAP_WARN_MS = CAP_MS - 60_000;

type Phase =
  | "setup"
  | "countdown"
  | "recording"
  | "paused"
  | "review"
  | "uploading";

type SetupError = "permission-denied" | "no-devices" | "unsupported" | null;

interface Take {
  id: number;
  file: File;
  url: string;
  durationMs: number;
}

/**
 * Recording studio (Build 7.1): camera+mic capture with countdown,
 * pause/resume, a 10-minute cap tied to the upload limit, and take
 * management. The chosen take is handed to the EXISTING UploadFlow — from
 * there the pipeline (transcribe → AI → edit → export) is unchanged.
 */
export function RecordFlow() {
  const t = useTranslations("record");

  const [phase, setPhase] = useState<Phase>("setup");
  const [setupError, setSetupError] = useState<SetupError>(null);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [cameraId, setCameraId] = useState<string>("");
  const [micId, setMicId] = useState<string>("");

  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [takes, setTakes] = useState<Take[]>([]);
  const [reviewTake, setReviewTake] = useState<Take | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const sessionRef = useRef<RecorderSession | null>(null);
  const previewRef = useRef<HTMLVideoElement | null>(null);
  const takeCounter = useRef(0);
  const mimeRef = useRef<string | null>(null);

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  /** Open (or reopen) the camera/mic stream for the current device picks. */
  const openStream = useCallback(
    async (video?: string, audio?: string) => {
      setSetupError(null);
      releaseStream();
      try {
        if (typeof MediaRecorder === "undefined") {
          setSetupError("unsupported");
          return;
        }
        const mime = pickRecorderMimeType((m) => MediaRecorder.isTypeSupported(m));
        if (!mime) {
          setSetupError("unsupported");
          return;
        }
        mimeRef.current = mime;

        const stream = await navigator.mediaDevices.getUserMedia({
          video: video ? { deviceId: { exact: video } } : true,
          audio: audio ? { deviceId: { exact: audio } } : true,
        });
        streamRef.current = stream;
        if (previewRef.current) previewRef.current.srcObject = stream;

        // Device labels are only populated after permission is granted.
        const devices = await navigator.mediaDevices.enumerateDevices();
        setCameras(devices.filter((d) => d.kind === "videoinput"));
        setMics(devices.filter((d) => d.kind === "audioinput"));
      } catch (err) {
        console.error("getUserMedia failed", err);
        const name = (err as DOMException)?.name;
        setSetupError(
          name === "NotFoundError" || name === "OverconstrainedError"
            ? "no-devices"
            : "permission-denied",
        );
      }
    },
    [releaseStream],
  );

  // First open + persisted device preference.
  useEffect(() => {
    let saved: { camera?: string; mic?: string } = {};
    try {
      saved = JSON.parse(localStorage.getItem(DEVICE_STORAGE_KEY) ?? "{}");
    } catch {
      /* fresh */
    }
    if (saved.camera) setCameraId(saved.camera);
    if (saved.mic) setMicId(saved.mic);
    void openStream(saved.camera, saved.mic);
    return () => {
      sessionRef.current?.stop();
      releaseStream();
    };
    // Mount-only by design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the preview attached across phase changes (the element remounts).
  useEffect(() => {
    if (previewRef.current && streamRef.current) {
      previewRef.current.srcObject = streamRef.current;
    }
  }, [phase]);

  const switchDevice = (kind: "camera" | "mic", id: string) => {
    const nextCamera = kind === "camera" ? id : cameraId;
    const nextMic = kind === "mic" ? id : micId;
    if (kind === "camera") setCameraId(id);
    else setMicId(id);
    try {
      localStorage.setItem(
        DEVICE_STORAGE_KEY,
        JSON.stringify({ camera: nextCamera || undefined, mic: nextMic || undefined }),
      );
    } catch {
      /* private mode */
    }
    void openStream(nextCamera || undefined, nextMic || undefined);
  };

  /** 3·2·1 then start the recorder session. */
  const beginCountdown = () => {
    setCountdown(COUNTDOWN_SECONDS);
    setPhase("countdown");
    let n = COUNTDOWN_SECONDS;
    const tick = setInterval(() => {
      n -= 1;
      if (n > 0) {
        setCountdown(n);
        return;
      }
      clearInterval(tick);
      startRecording();
    }, 1000);
  };

  const startRecording = () => {
    const stream = streamRef.current;
    const mime = mimeRef.current;
    if (!stream || !mime) {
      setPhase("setup");
      setSetupError("no-devices");
      return;
    }
    setElapsedMs(0);
    sessionRef.current = startRecorderSession({
      stream,
      mimeType: mime,
      maxDurationMs: CAP_MS,
      onTick: setElapsedMs,
      onComplete: (blob, durationMs) => {
        takeCounter.current += 1;
        // The File carries the bare CONTAINER mime (video/webm), not the
        // codec-qualified recorder mime — that's what the upload validator
        // and storage accept (found live: validate rejects ";codecs=").
        const file = new File([blob], takeFilename(takeCounter.current, mime), {
          type: containerOfMime(mime),
        });
        const take: Take = {
          id: takeCounter.current,
          file,
          url: URL.createObjectURL(blob),
          durationMs,
        };
        setReviewTake(take);
        setPhase("review");
      },
    });
    setPhase("recording");
  };

  const pause = () => {
    sessionRef.current?.pause();
    setPhase("paused");
  };
  const resume = () => {
    sessionRef.current?.resume();
    setPhase("recording");
  };
  const stop = () => sessionRef.current?.stop();

  const keepTake = () => {
    if (!reviewTake) return;
    setTakes((prev) => [...prev, reviewTake]);
    setReviewTake(null);
    setPhase("setup");
  };

  const discardTake = () => {
    if (reviewTake) URL.revokeObjectURL(reviewTake.url);
    setReviewTake(null);
    setPhase("setup");
  };

  const removeTake = (id: number) => {
    setTakes((prev) => {
      const gone = prev.find((take) => take.id === id);
      if (gone) URL.revokeObjectURL(gone.url);
      return prev.filter((take) => take.id !== id);
    });
  };

  const useTake = (take: Take) => {
    releaseStream(); // camera off — the take is final, upload owns the page.
    setUploadFile(take.file);
    setPhase("uploading");
  };

  const mb = (bytes: number) => (bytes / (1024 * 1024)).toFixed(1);
  const capWarning = elapsedMs >= CAP_WARN_MS;
  const recordingLike = phase === "recording" || phase === "paused";

  // ---- Upload handoff: the existing flow owns everything from here. ----
  if (phase === "uploading" && uploadFile) {
    return (
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">{t("uploadingTitle")}</h2>
        <UploadFlow externalFile={uploadFile} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Preview stage */}
      <div className="relative overflow-hidden rounded-2xl bg-neutral-950">
        <video
          ref={previewRef}
          autoPlay
          muted
          playsInline
          className="aspect-video w-full -scale-x-100 object-cover"
        />

        {/* Countdown overlay */}
        {phase === "countdown" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <span className="text-8xl font-bold tabular-nums text-white">{countdown}</span>
          </div>
        )}

        {/* Recording status chip */}
        {recordingLike && (
          <div
            dir="ltr"
            className={`absolute start-4 top-4 flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold tabular-nums ${
              capWarning ? "bg-amber-500 text-black" : "bg-black/70 text-white"
            }`}
          >
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                phase === "recording" ? "animate-pulse bg-red-500" : "bg-neutral-400"
              }`}
            />
            {formatElapsed(elapsedMs)} / {formatElapsed(CAP_MS)}
          </div>
        )}

        {/* Review overlay plays the fresh take on top of the live preview */}
        {phase === "review" && reviewTake && (
          <video
            src={reviewTake.url}
            controls
            playsInline
            className="absolute inset-0 h-full w-full bg-black object-contain"
          />
        )}
      </div>

      {/* Setup errors */}
      {phase === "setup" && setupError && (
        <div className="flex flex-col gap-3 rounded-xl border border-red-500/40 bg-red-500/5 p-4">
          <p role="alert" className="text-sm text-red-500">
            {t(`errors.${setupError}`)}
          </p>
          <button
            type="button"
            onClick={() => void openStream(cameraId || undefined, micId || undefined)}
            className="w-fit rounded-lg border border-border px-4 py-2 text-sm hover:border-accent"
          >
            {t("retryDevices")}
          </button>
        </div>
      )}

      {/* Controls */}
      {phase === "setup" && !setupError && (
        <div className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm">
              {t("camera")}
              <select
                value={cameraId}
                onChange={(e) => switchDevice("camera", e.target.value)}
                className="rounded-xl border border-border bg-transparent px-3 py-2"
              >
                {cameras.map((d, i) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || t("cameraFallback", { n: i + 1 })}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              {t("microphone")}
              <select
                value={micId}
                onChange={(e) => switchDevice("mic", e.target.value)}
                className="rounded-xl border border-border bg-transparent px-3 py-2"
              >
                {mics.map((d, i) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || t("micFallback", { n: i + 1 })}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={beginCountdown}
              className="rounded-xl bg-red-600 px-6 py-2.5 font-semibold text-white transition hover:bg-red-500"
            >
              {takes.length > 0 ? t("recordAnother") : t("startRecording")}
            </button>
            <span className="text-xs text-muted">{t("capHint")}</span>
          </div>
        </div>
      )}

      {recordingLike && (
        <div className="flex items-center gap-3">
          {phase === "recording" ? (
            <button
              type="button"
              onClick={pause}
              className="rounded-xl border border-border px-5 py-2.5 text-sm font-semibold hover:border-accent"
            >
              {t("pause")}
            </button>
          ) : (
            <button
              type="button"
              onClick={resume}
              className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground"
            >
              {t("resume")}
            </button>
          )}
          <button
            type="button"
            onClick={stop}
            className="rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-500"
          >
            {t("stop")}
          </button>
        </div>
      )}

      {phase === "review" && reviewTake && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={keepTake}
            className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground hover:opacity-90"
          >
            {t("keepTake")}
          </button>
          <button
            type="button"
            onClick={discardTake}
            className="rounded-xl border border-border px-5 py-2.5 text-sm hover:border-red-500 hover:text-red-500"
          >
            {t("discardTake")}
          </button>
          <span dir="ltr" className="text-sm tabular-nums text-muted">
            {formatElapsed(reviewTake.durationMs)} · {mb(reviewTake.file.size)}MB
          </span>
        </div>
      )}

      {/* Takes rail */}
      {takes.length > 0 && phase !== "review" && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{t("takesTitle")}</h2>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {takes.map((take) => (
              <li
                key={take.id}
                className="flex flex-col gap-2 rounded-xl border border-border p-3"
              >
                <video src={take.url} controls playsInline className="aspect-video w-full rounded-lg bg-black object-contain" />
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">
                    {t("takeLabel", { n: take.id })}
                  </span>
                  <span dir="ltr" className="text-xs tabular-nums text-muted">
                    {formatElapsed(take.durationMs)} · {mb(take.file.size)}MB
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={phase !== "setup"}
                    onClick={() => useTake(take)}
                    className="flex-1 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-accent-foreground transition hover:opacity-90 disabled:opacity-50"
                  >
                    {t("useTake")}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeTake(take.id)}
                    className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted hover:border-red-500 hover:text-red-500"
                  >
                    {t("deleteTake")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
