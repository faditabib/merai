"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { MAX_RAW_UPLOAD_SECONDS, type OverlayPosition } from "@merai/core";
import {
  containerOfMime,
  formatElapsed,
  pickRecorderMimeType,
  startRecorderSession,
  takeFilename,
  type RecorderSession,
} from "@/lib/record/recorder";
import {
  clampPipWidth,
  createCompositeStream,
  PIP_WIDTH_DEFAULT,
  PIP_WIDTH_MAX,
  PIP_WIDTH_MIN,
  RECORD_MODES,
  streamsForMode,
  type CompositeHandle,
  type RecordMode,
} from "@/lib/record/composite";
import {
  clampCountdown,
  clampFontPx,
  clampScrollSpeed,
  COUNTDOWN_DEFAULT,
  COUNTDOWN_OPTIONS,
  estimateReadingSeconds,
  FONT_DEFAULT,
  FONT_MAX,
  FONT_MIN,
  SCRIPT_MAX_CHARS,
  SCRIPT_STORAGE_KEY,
  SPEED_DEFAULT,
  SPEED_MAX,
  SPEED_MIN,
  type PrompterMode,
} from "@/lib/record/teleprompter";
import { TeleprompterOverlay } from "@/components/record/teleprompter";
import { ScenesUploadFlow } from "@/components/record/scenes-upload-flow";
import { UploadFlow } from "@/components/upload-flow";

const DEVICE_STORAGE_KEY = "merai.record.devices";
const PREFS_STORAGE_KEY = "merai.record.prefs";
const CAP_MS = MAX_RAW_UPLOAD_SECONDS * 1000;
/** Amber warning zone: the last 60 seconds before the cap. */
const CAP_WARN_MS = CAP_MS - 60_000;

type Phase =
  | "setup"
  | "countdown"
  | "recording"
  | "paused"
  | "review"
  | "uploading"
  | "uploading-scenes";

type SetupError =
  | "permission-denied"
  | "no-devices"
  | "unsupported"
  | "screen-denied"
  | null;

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

  const [countdown, setCountdown] = useState(COUNTDOWN_DEFAULT);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [takes, setTakes] = useState<Take[]>([]);
  const [reviewTake, setReviewTake] = useState<Take | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  // Build 7.2: recording mode + PiP preferences (persisted, device-level).
  const [mode, setMode] = useState<RecordMode>("camera");
  const [pipPosition, setPipPosition] = useState<OverlayPosition>("bottom-end");
  const [pipWidthPct, setPipWidthPct] = useState(PIP_WIDTH_DEFAULT);

  // Build 7.3: prompter + countdown preference.
  const [prompterMode, setPrompterMode] = useState<PrompterMode>("off");
  const [script, setScript] = useState("");
  const [prompterSpeed, setPrompterSpeed] = useState(SPEED_DEFAULT);
  const [prompterFont, setPrompterFont] = useState(FONT_DEFAULT);
  const [countdownSeconds, setCountdownSeconds] = useState(COUNTDOWN_DEFAULT);

  const streamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const compositeRef = useRef<CompositeHandle | null>(null);
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

  const releaseScreen = useCallback(() => {
    compositeRef.current?.stop();
    compositeRef.current = null;
    screenStreamRef.current?.getTracks().forEach((track) => track.stop());
    screenStreamRef.current = null;
  }, []);

  // First open + persisted device/mode/PiP preferences.
  useEffect(() => {
    let saved: { camera?: string; mic?: string } = {};
    try {
      saved = JSON.parse(localStorage.getItem(DEVICE_STORAGE_KEY) ?? "{}");
    } catch {
      /* fresh */
    }
    try {
      const prefs = JSON.parse(localStorage.getItem(PREFS_STORAGE_KEY) ?? "{}");
      if ((RECORD_MODES as readonly string[]).includes(prefs.mode)) setMode(prefs.mode);
      if (["top-start", "top-end", "bottom-start", "bottom-end"].includes(prefs.pipPosition)) {
        setPipPosition(prefs.pipPosition);
      }
      if (typeof prefs.pipWidthPct === "number") {
        setPipWidthPct(clampPipWidth(prefs.pipWidthPct));
      }
      // 7.3 prefs (tolerant of older saved shapes).
      if (["off", "notes", "prompter"].includes(prefs.prompterMode)) {
        setPrompterMode(prefs.prompterMode);
      }
      if (typeof prefs.prompterSpeed === "number") {
        setPrompterSpeed(clampScrollSpeed(prefs.prompterSpeed));
      }
      if (typeof prefs.prompterFont === "number") {
        setPrompterFont(clampFontPx(prefs.prompterFont));
      }
      if (typeof prefs.countdownSeconds === "number") {
        setCountdownSeconds(clampCountdown(prefs.countdownSeconds));
      }
    } catch {
      /* fresh */
    }
    try {
      const draft = localStorage.getItem(SCRIPT_STORAGE_KEY);
      if (draft) setScript(draft.slice(0, SCRIPT_MAX_CHARS));
    } catch {
      /* fresh */
    }
    if (saved.camera) setCameraId(saved.camera);
    if (saved.mic) setMicId(saved.mic);
    void openStream(saved.camera, saved.mic);
    return () => {
      sessionRef.current?.stop();
      releaseScreen();
      releaseStream();
    };
    // Mount-only by design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist prefs whenever they change; the script drafts separately.
  useEffect(() => {
    try {
      localStorage.setItem(
        PREFS_STORAGE_KEY,
        JSON.stringify({
          mode,
          pipPosition,
          pipWidthPct,
          prompterMode,
          prompterSpeed,
          prompterFont,
          countdownSeconds,
        }),
      );
    } catch {
      /* private mode */
    }
  }, [mode, pipPosition, pipWidthPct, prompterMode, prompterSpeed, prompterFont, countdownSeconds]);

  useEffect(() => {
    try {
      localStorage.setItem(SCRIPT_STORAGE_KEY, script);
    } catch {
      /* private mode */
    }
  }, [script]);

  // Keep the preview attached across phase changes (the element remounts).
  // While a composite is live (screen modes), the preview must show the
  // EXACT stream being recorded, not the raw camera (preview = output).
  useEffect(() => {
    const active = compositeRef.current?.stream ?? streamRef.current;
    if (previewRef.current && active) {
      previewRef.current.srcObject = active;
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

  /** Screen picker (must run inside the user gesture), then 3·2·1, then
   *  start the recorder session. */
  const beginCountdown = async () => {
    setSetupError(null);
    const needs = streamsForMode(mode);
    if (needs.screen) {
      try {
        screenStreamRef.current = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true, // system audio when the browser/OS offers it
        });
      } catch (err) {
        console.error("getDisplayMedia failed", err);
        setSetupError("screen-denied");
        return;
      }
    }
    setCountdown(countdownSeconds);
    setPhase("countdown");
    let n = countdownSeconds;
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
    const cameraStream = streamRef.current;
    const mime = mimeRef.current;
    const needs = streamsForMode(mode);
    if (!cameraStream || !mime || (needs.screen && !screenStreamRef.current)) {
      releaseScreen();
      setPhase("setup");
      setSetupError("no-devices");
      return;
    }

    // Camera mode records the raw camera stream (7.1). Screen modes record
    // the composite canvas: screen full-frame (+ camera bubble in
    // screen-camera) + mic/display audio mixed — ONE blob either way.
    let recordingStream = cameraStream;
    if (needs.screen && screenStreamRef.current) {
      compositeRef.current = createCompositeStream({
        screenStream: screenStreamRef.current,
        cameraStream: mode === "screen-camera" ? cameraStream : null,
        micStream: cameraStream, // its audio tracks; video ignored
        pip: { position: pipPosition, widthPct: pipWidthPct },
        onScreenEnded: () => sessionRef.current?.stop(),
      });
      recordingStream = compositeRef.current.stream;
      // The preview shows the EXACT stream being recorded.
      if (previewRef.current) previewRef.current.srcObject = recordingStream;
    }

    setElapsedMs(0);
    sessionRef.current = startRecorderSession({
      stream: recordingStream,
      mimeType: mime,
      maxDurationMs: CAP_MS,
      onTick: setElapsedMs,
      onComplete: (blob, durationMs) => {
        // Tear down screen/composite; restore the camera preview.
        releaseScreen();
        if (previewRef.current && streamRef.current) {
          previewRef.current.srcObject = streamRef.current;
        }
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

  /** Build 7.4: all kept takes become the ORDERED SCENES of one project. */
  const combineTakes = () => {
    releaseStream();
    setPhase("uploading-scenes");
  };

  const totalTakesMs = takes.reduce((sum, take) => sum + take.durationMs, 0);
  const scenesOverCap = totalTakesMs > CAP_MS;

  const mb = (bytes: number) => (bytes / (1024 * 1024)).toFixed(1);
  const capWarning = elapsedMs >= CAP_WARN_MS;
  const recordingLike = phase === "recording" || phase === "paused";
  const needs = streamsForMode(mode);
  // Mirror only the raw selfie camera — never the screen composite.
  const mirrorPreview = !(recordingLike && needs.screen);

  // ---- Upload handoff: the existing flow owns everything from here. ----
  if (phase === "uploading" && uploadFile) {
    return (
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">{t("uploadingTitle")}</h2>
        <UploadFlow externalFile={uploadFile} />
      </div>
    );
  }

  // ---- Multi-scene handoff (7.4): N scenes → one stitched project. ----
  if (phase === "uploading-scenes") {
    return (
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">{t("scenes.title")}</h2>
        <ScenesUploadFlow
          title={t("scenes.projectTitle", {
            date: new Date().toLocaleDateString(),
          })}
          scenes={takes.map((take) => ({
            file: take.file,
            durationSeconds: take.durationMs / 1000,
          }))}
        />
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
          className={`aspect-video w-full object-cover ${mirrorPreview ? "-scale-x-100" : ""}`}
        />

        {/* Countdown overlay */}
        {phase === "countdown" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <span className="text-8xl font-bold tabular-nums text-white">{countdown}</span>
          </div>
        )}

        {/* Prompter / notes overlay (7.3) — DOM above the video; can never
            leak into the recorded MediaStream. */}
        {recordingLike && (
          <TeleprompterOverlay
            mode={prompterMode}
            script={script}
            elapsedMs={elapsedMs}
            running={phase === "recording"}
            speedPxPerSec={prompterSpeed}
            fontPx={prompterFont}
          />
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

      {/* Device setup errors (camera/mic) — blocking, with retry. */}
      {phase === "setup" && setupError && setupError !== "screen-denied" && (
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

      {/* Screen-share denied — non-blocking, controls stay usable. */}
      {phase === "setup" && setupError === "screen-denied" && (
        <p role="alert" className="rounded-xl border border-red-500/40 bg-red-500/5 p-4 text-sm text-red-500">
          {t("errors.screen-denied")}
        </p>
      )}

      {/* Controls */}
      {phase === "setup" && (!setupError || setupError === "screen-denied") && (
        <div className="flex flex-col gap-4">
          {/* Mode selector (7.2) */}
          <div className="flex flex-col gap-1.5">
            <span className="text-sm">{t("modeLabel")}</span>
            <div className="flex flex-wrap gap-1.5">
              {RECORD_MODES.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`rounded-lg border px-4 py-2 text-sm ${
                    mode === m
                      ? "border-accent bg-accent/15 text-accent"
                      : "border-border text-muted hover:border-accent"
                  }`}
                >
                  {t(`modes.${m}`)}
                </button>
              ))}
            </div>
            {needs.screen && <p className="text-xs text-muted">{t("screenHint")}</p>}
          </div>

          {/* PiP preferences (screen-camera) — the bubble uses the brand-logo
              geometry, same corners and size semantics as the Overlay Studio. */}
          {mode === "screen-camera" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-muted">{t("pipPosition")}</span>
                <div className="grid grid-cols-2 gap-1.5">
                  {(["top-start", "top-end", "bottom-start", "bottom-end"] as OverlayPosition[]).map(
                    (p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPipPosition(p)}
                        className={`rounded-lg border px-2 py-1.5 text-xs ${
                          pipPosition === p
                            ? "border-accent bg-accent/15 text-accent"
                            : "border-border text-muted hover:border-accent"
                        }`}
                      >
                        {t(`pipPositions.${p}`)}
                      </button>
                    ),
                  )}
                </div>
              </div>
              <label className="flex flex-col gap-1.5 text-sm">
                {t("pipSize", { percent: Math.round(pipWidthPct * 100) })}
                <input
                  type="range"
                  min={Math.round(PIP_WIDTH_MIN * 100)}
                  max={Math.round(PIP_WIDTH_MAX * 100)}
                  value={Math.round(pipWidthPct * 100)}
                  onChange={(e) => setPipWidthPct(Number(e.target.value) / 100)}
                  dir="ltr"
                />
              </label>
            </div>
          )}

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
          {/* Prompter / speaker notes (7.3) */}
          <div className="flex flex-col gap-2 rounded-xl border border-border p-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="me-1 text-sm">{t("prompter.label")}</span>
              {(["off", "notes", "prompter"] as PrompterMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setPrompterMode(m)}
                  className={`rounded-lg border px-3 py-1.5 text-xs ${
                    prompterMode === m
                      ? "border-accent bg-accent/15 text-accent"
                      : "border-border text-muted hover:border-accent"
                  }`}
                >
                  {t(`prompter.modes.${m}`)}
                </button>
              ))}
            </div>
            {prompterMode !== "off" && (
              <>
                <textarea
                  value={script}
                  maxLength={SCRIPT_MAX_CHARS}
                  onChange={(e) => setScript(e.target.value)}
                  placeholder={t("prompter.placeholder")}
                  rows={4}
                  className="rounded-xl border border-border bg-transparent px-3 py-2 text-sm leading-relaxed"
                />
                <div className="flex flex-wrap items-center gap-4">
                  {script.trim() && (
                    <span dir="ltr" className="text-xs tabular-nums text-muted">
                      ≈ {formatElapsed(estimateReadingSeconds(script) * 1000)}
                    </span>
                  )}
                  {prompterMode === "prompter" && (
                    <label className="flex items-center gap-2 text-xs text-muted">
                      {t("prompter.speed")}
                      <input
                        type="range"
                        min={SPEED_MIN}
                        max={SPEED_MAX}
                        value={prompterSpeed}
                        onChange={(e) => setPrompterSpeed(Number(e.target.value))}
                        dir="ltr"
                      />
                    </label>
                  )}
                  <label className="flex items-center gap-2 text-xs text-muted">
                    {t("prompter.fontSize")}
                    <input
                      type="range"
                      min={FONT_MIN}
                      max={FONT_MAX}
                      value={prompterFont}
                      onChange={(e) => setPrompterFont(Number(e.target.value))}
                      dir="ltr"
                    />
                  </label>
                </div>
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void beginCountdown()}
              className="rounded-xl bg-red-600 px-6 py-2.5 font-semibold text-white transition hover:bg-red-500"
            >
              {takes.length > 0 ? t("recordAnother") : t("startRecording")}
            </button>
            {/* Countdown preference (7.3) */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted">{t("countdownLabel")}</span>
              {COUNTDOWN_OPTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setCountdownSeconds(s)}
                  className={`rounded-lg border px-2.5 py-1 text-xs tabular-nums ${
                    countdownSeconds === s
                      ? "border-accent bg-accent/15 text-accent"
                      : "border-border text-muted hover:border-accent"
                  }`}
                >
                  {t("countdownSeconds", { s })}
                </button>
              ))}
            </div>
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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">{t("takesTitle")}</h2>
            {/* 7.4: takes become the ordered scenes of ONE project. */}
            {takes.length >= 2 && (
              <div className="flex items-center gap-2">
                <span dir="ltr" className="text-xs tabular-nums text-muted">
                  {formatElapsed(totalTakesMs)}
                </span>
                <button
                  type="button"
                  disabled={phase !== "setup" || scenesOverCap}
                  onClick={combineTakes}
                  title={scenesOverCap ? t("scenes.overCap") : undefined}
                  className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition hover:opacity-90 disabled:opacity-50"
                >
                  {t("scenes.combine", { n: takes.length })}
                </button>
              </div>
            )}
          </div>
          {scenesOverCap && takes.length >= 2 && (
            <p className="text-xs text-amber-600">{t("scenes.overCap")}</p>
          )}
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
