"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  applyEditCommand,
  applyEditCommands,
  segmentAtSource,
  nextSegmentAfterSource,
  edlOutputDurationMs,
  sourceToOutputMs,
  CAPTION_STYLE_SPECS,
  DEFAULT_CAPTION_STYLE,
  type BrandExportConfig,
  type CaptionBrandColors,
  type CaptionStyleSpec,
  type CreatorTypeId,
  type EditCommand,
  type EdlV1,
  type TranscriptWord,
} from "@merai/core";
import { decodePeaksFromMedia } from "@/lib/editor/waveform";
import { createClient } from "@/lib/supabase/client";
import { CaptionStudio } from "@/components/caption-studio";
import { AiAssistantPanel } from "./ai-assistant-panel";
import { CaptionOverlay } from "./caption-overlay";
import { ExportPanel } from "./export-panel";
import { ShortcutsHelp } from "./shortcuts-help";
import { Timeline } from "./timeline";
import { TranscriptPanel } from "./transcript-panel";

const RAW_BUCKET = "raw-uploads";

export interface EditorViewProps {
  projectId: string;
  projectTitle: string;
  ownerId: string;
  words: TranscriptWord[];
  languageCode: string | null;
  initialEdl: EdlV1;
  initialVersion: number;
  initialEdlVersionId: string;
  storagePath: string;
  sourceDurationMs: number;
  /** Owner's Brand Kit compiled to an export snapshot; null = no branding set. */
  brandConfig: BrandExportConfig | null;
  /** Owner's brand colors for brand-* caption presets; null = no kit. */
  brandColors: CaptionBrandColors | null;
  /** Creator's saved default caption spec (Caption Studio); null = none. */
  captionDefaultConfig: CaptionStyleSpec | null;
  /** Brand kit name for the export "your video style" card; null = no kit. */
  brandName: string | null;
  /** Persona (user_metadata.creator_type) — ranks the Skills row (Build 8). */
  creatorType: CreatorTypeId | null;
}

/**
 * The review editor. Holds the working EDL; every mutation is a pure
 * transform from @merai/core (undo/redo = snapshot stacks). Saving appends
 * an immutable edl_version (source='user') — the AI draft is never touched.
 */
export function EditorView(props: EditorViewProps) {
  const t = useTranslations("editor");
  const supabase = useMemo(() => createClient(), []);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [edl, setEdl] = useState(props.initialEdl);
  const [undoStack, setUndoStack] = useState<EdlV1[]>([]);
  const [redoStack, setRedoStack] = useState<EdlV1[]>([]);
  const [version, setVersion] = useState(props.initialVersion);
  const [savedVersionId, setSavedVersionId] = useState(props.initialEdlVersionId);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);

  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  // Build 7.5 (Auto Canvas): the source's real dimensions, read once the
  // player has metadata — drives the aspect recommendation.
  const [sourceDims, setSourceDims] = useState<{ width: number; height: number } | null>(null);
  const [videoError, setVideoError] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [sourceMs, setSourceMs] = useState(0);
  // Timeline v2 (7.6): bucketed audio peaks of the full source (null until
  // decoded; stays null when decoding isn't possible).
  const [peaks, setPeaks] = useState<number[] | null>(null);
  const [previewEdit, setPreviewEdit] = useState(true);
  const [selectedWordIds, setSelectedWordIds] = useState<string[]>([]);

  // Working caption spec (Build 6B.3): the creator's saved default, else the
  // EDL preset's base spec. Preset picks sync the EDL token (back-compat);
  // control tweaks live only in the spec and ride caption_config at export.
  const [captionSpec, setCaptionSpec] = useState<CaptionStyleSpec>(
    props.captionDefaultConfig ??
      CAPTION_STYLE_SPECS[
        (props.initialEdl.captionStyle as keyof typeof CAPTION_STYLE_SPECS) in
        CAPTION_STYLE_SPECS
          ? (props.initialEdl.captionStyle as keyof typeof CAPTION_STYLE_SPECS)
          : DEFAULT_CAPTION_STYLE
      ],
  );
  // Plain function (not memoized): always closes over the current runCommand,
  // called only at event time. Keeps the EDL's caption token in sync when the
  // preset changes (saved versions + the token path stay correct); control
  // tweaks live only in the spec and ride caption_config at export.
  const onChangeCaptionSpec = (next: CaptionStyleSpec) => {
    setCaptionSpec(next);
    if (next.token !== edl.captionStyle) {
      runCommand({ type: "set-caption-style", styleToken: next.token });
    }
  };

  // --- media -----------------------------------------------------------------
  useEffect(() => {
    const objectName = props.storagePath.slice(RAW_BUCKET.length + 1);
    supabase.storage
      .from(RAW_BUCKET)
      .createSignedUrl(objectName, 3600)
      .then(({ data, error }) => {
        if (error || !data) setVideoError(true);
        else setVideoUrl(data.signedUrl);
      });
  }, [props.storagePath, supabase]);

  // Timeline v2 (7.6): decode the source's audio ONCE into bucketed peaks.
  // Progressive enhancement — any failure just means no waveform.
  useEffect(() => {
    if (!videoUrl) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(videoUrl);
        if (!response.ok) return;
        const bytes = await response.arrayBuffer();
        if (cancelled) return;
        const decoded = await decodePeaksFromMedia(bytes);
        if (!cancelled && decoded) setPeaks(decoded);
      } catch {
        /* no waveform */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [videoUrl]);

  // Fine-grained playhead tracking (timeupdate is too coarse for karaoke).
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const video = videoRef.current;
      if (video) setSourceMs(Math.round(video.currentTime * 1000));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // EDL-aware preview: skip removed regions while playing in edit mode.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !previewEdit || !playing) return;
    if (segmentAtSource(edl, sourceMs)) return;
    const next = nextSegmentAfterSource(edl, sourceMs);
    if (next) {
      video.currentTime = next.sourceInMs / 1000;
    } else {
      video.pause();
    }
  }, [sourceMs, playing, previewEdit, edl]);

  const seekSource = useCallback((ms: number) => {
    const video = videoRef.current;
    if (video) video.currentTime = Math.max(0, ms) / 1000;
    setSourceMs(Math.max(0, ms));
  }, []);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play();
    else video.pause();
  }, []);

  // --- EDL mutations ----------------------------------------------------------
  const apply = useCallback(
    (next: EdlV1) => {
      if (next === edl) return;
      setUndoStack((stack) => [...stack, edl]);
      setRedoStack([]);
      setEdl(next);
      setDirty(true);
    },
    [edl],
  );

  /** Every mutation goes through the serializable command surface (Build 5):
   *  UI handlers and AI re-editing share this one entry point. */
  const runCommand = useCallback(
    (command: EditCommand) => apply(applyEditCommand(edl, props.words, command)),
    [apply, edl, props.words],
  );

  /** AI Brain plans apply as ONE batch = one undo snapshot (Build 5.5). */
  const applyAiCommands = useCallback(
    (commands: EditCommand[]) =>
      apply(applyEditCommands(edl, props.words, commands)),
    [apply, edl, props.words],
  );

  const undo = useCallback(() => {
    setUndoStack((stack) => {
      const previous = stack[stack.length - 1];
      if (!previous) return stack;
      setRedoStack((redo) => [...redo, edl]);
      setEdl(previous);
      setDirty(true);
      return stack.slice(0, -1);
    });
  }, [edl]);

  const redo = useCallback(() => {
    setRedoStack((stack) => {
      const next = stack[stack.length - 1];
      if (!next) return stack;
      setUndoStack((undoS) => [...undoS, edl]);
      setEdl(next);
      setDirty(true);
      return stack.slice(0, -1);
    });
  }, [edl]);

  const deleteSelectedWords = useCallback(() => {
    if (selectedWordIds.length === 0) return;
    runCommand({ type: "remove-words", wordIds: selectedWordIds });
    setSelectedWordIds([]);
  }, [runCommand, selectedWordIds]);

  const save = useCallback(async (): Promise<string | null> => {
    setSaving(true);
    setSaveError(false);
    const nextVersion = version + 1;
    const { data, error } = await supabase
      .from("edl_versions")
      .insert({
        project_id: props.projectId,
        owner_id: props.ownerId,
        version: nextVersion,
        source: "user",
        edl,
      })
      .select("id")
      .single();
    setSaving(false);
    if (error || !data) {
      setSaveError(true);
      return null;
    }
    setVersion(nextVersion);
    setSavedVersionId(data.id as string);
    setDirty(false);
    return data.id as string;
  }, [edl, props.ownerId, props.projectId, supabase, version]);

  /** Export needs a persisted version — saves only when there are changes. */
  const ensureSavedVersion = useCallback(async (): Promise<string | null> => {
    if (!dirty) return savedVersionId;
    return save();
  }, [dirty, save, savedVersionId]);

  // Keyboard: Delete removes selection, ctrl+z/ctrl+shift+z undo/redo, space
  // play, ?/؟ shortcut help (؟ = Arabic keyboard layouts), Esc closes it.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        deleteSelectedWords();
      } else if (event.key === "z" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (event.key === " ") {
        event.preventDefault();
        togglePlay();
      } else if (
        event.key === "?" ||
        event.key === "؟" ||
        // Physical Shift+/ regardless of layout — Arabic layouts emit ؟ from
        // this key, and some browsers/layouts report only the code (QA bug #2).
        (event.shiftKey && event.code === "Slash")
      ) {
        event.preventDefault();
        setShortcutsOpen((open) => !open);
      } else if (event.key === "Escape") {
        setShortcutsOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deleteSelectedWords, redo, togglePlay, undo]);

  // Warn about unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const outputDurationMs = edlOutputDurationMs(edl);
  const outputMs = sourceToOutputMs(edl, sourceMs);

  const formatMs = (ms: number) => {
    const total = Math.max(0, Math.round(ms / 1000));
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  };

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="truncate text-xl font-bold">{props.projectTitle}</h1>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted">
            {t("versionLabel", { version })}
            {dirty && " •"}
          </span>
          <button
            type="button"
            onClick={() => setShortcutsOpen(true)}
            title={t("shortcuts.hint")}
            className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted hover:border-accent hover:text-accent"
          >
            <span dir="ltr">⌨ ?</span>
            <span className="sr-only">{t("shortcuts.open")}</span>
          </button>
          <button
            type="button"
            onClick={undo}
            disabled={undoStack.length === 0}
            className="rounded-lg border border-border px-3 py-1.5 text-sm disabled:opacity-40"
          >
            {t("undo")}
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={redoStack.length === 0}
            className="rounded-lg border border-border px-3 py-1.5 text-sm disabled:opacity-40"
          >
            {t("redo")}
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={!dirty || saving}
            className="rounded-lg bg-accent px-4 py-1.5 text-sm font-semibold text-accent-foreground disabled:opacity-40"
          >
            {saving ? t("saving") : t("save")}
          </button>
        </div>
      </div>
      {saveError && (
        <p role="alert" className="text-sm text-red-500">
          {t("saveError")}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        {/* Player */}
        <section className="flex flex-col gap-3">
          <div className="relative overflow-hidden rounded-2xl bg-black">
            {videoUrl ? (
              <video
                ref={videoRef}
                src={videoUrl}
                className="max-h-[420px] w-full"
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onLoadedMetadata={(e) =>
                  setSourceDims({
                    width: e.currentTarget.videoWidth,
                    height: e.currentTarget.videoHeight,
                  })
                }
                playsInline
              />
            ) : (
              <div className="flex h-64 items-center justify-center text-sm text-muted">
                {videoError ? t("videoError") : t("videoLoading")}
              </div>
            )}
            <CaptionOverlay
              edl={edl}
              words={props.words}
              sourceMs={sourceMs}
              spec={captionSpec}
              brandColors={props.brandColors}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={togglePlay}
              className="rounded-xl bg-accent px-5 py-2 font-semibold text-accent-foreground"
            >
              {playing ? t("pause") : t("play")}
            </button>
            <span className="text-sm tabular-nums text-muted" dir="ltr">
              {previewEdit && outputMs != null
                ? `${formatMs(outputMs)} / ${formatMs(outputDurationMs)}`
                : `${formatMs(sourceMs)} / ${formatMs(props.sourceDurationMs)}`}
            </span>
            <label className="ms-auto flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={previewEdit}
                onChange={(event) => setPreviewEdit(event.target.checked)}
              />
              {t("previewEdit")}
            </label>
          </div>

          {/* Caption Studio (Build 6B.3): gallery + live controls. The live
              preview shows over the video above, so compact hides the extra. */}
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">{t("captionStyle")}</span>
            <CaptionStudio
              spec={captionSpec}
              onChange={onChangeCaptionSpec}
              brandColors={props.brandColors}
              compact
            />
          </div>
        </section>

        {/* Transcript editor */}
        <TranscriptPanel
          edl={edl}
          words={props.words}
          languageCode={props.languageCode}
          sourceMs={sourceMs}
          selectedWordIds={selectedWordIds}
          onSelectWords={setSelectedWordIds}
          onSeek={seekSource}
          onDeleteSelected={deleteSelectedWords}
          onRestore={(removedId) => runCommand({ type: "restore-removed", removedId })}
        />
      </div>

      {/* Timeline — pinned LTR (see DECISIONS.md) */}
      <Timeline
        edl={edl}
        words={props.words}
        sourceMs={sourceMs}
        sourceDurationMs={props.sourceDurationMs}
        peaks={peaks}
        onSeek={seekSource}
        onTrim={(segmentId, edge, ms) =>
          runCommand({ type: "trim-segment", segmentId, edge, ms })
        }
        onSplit={(segmentId, ms) =>
          runCommand({ type: "split-segment", segmentId, sourceMs: ms })
        }
        onReorder={(segmentId, toIndex) =>
          runCommand({ type: "reorder-segment", segmentId, toIndex })
        }
        onRippleDelete={(segmentId) =>
          runCommand({ type: "ripple-delete-segment", segmentId })
        }
        onRestore={(removedId) => runCommand({ type: "restore-removed", removedId })}
      />

      <ShortcutsHelp open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

      <AiAssistantPanel
        projectId={props.projectId}
        ownerId={props.ownerId}
        savedVersionId={savedVersionId}
        dirty={dirty}
        edl={edl}
        words={props.words}
        creatorType={props.creatorType}
        ensureSavedVersion={ensureSavedVersion}
        onApplyCommands={applyAiCommands}
      />

      <ExportPanel
        projectId={props.projectId}
        ownerId={props.ownerId}
        edl={edl}
        captionSpec={captionSpec}
        brandConfig={props.brandConfig}
        brandColors={props.brandColors}
        brandName={props.brandName}
        sourceDims={sourceDims}
        onChangeAspect={(ratio) =>
          runCommand({ type: "set-aspect-ratio", aspectRatio: ratio })
        }
        // UX sprint: Auto Canvas keeping the aspect in sync is bookkeeping,
        // not an edit — it must never pollute the undo stack.
        onChangeAspectSilent={(ratio) => {
          setEdl((prev) => (prev.aspectRatio === ratio ? prev : { ...prev, aspectRatio: ratio }));
          setDirty(true);
        }}
        ensureSavedVersion={ensureSavedVersion}
      />
    </main>
  );
}
