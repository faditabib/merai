"use client";

import { useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  edlOutputDurationMs,
  segmentAtSource,
  sourceToOutputMs,
  type EdlV1,
  type RemovedSegment,
  type TranscriptWord,
} from "@merai/core";
import { AiDecisionCard } from "./ai-decision-card";

export interface TimelineProps {
  edl: EdlV1;
  words: TranscriptWord[];
  sourceMs: number;
  sourceDurationMs: number;
  onSeek: (sourceMs: number) => void;
  onTrim: (segmentId: string, edge: "in" | "out", newMs: number) => void;
  onSplit: (segmentId: string, sourceMs: number) => void;
  onReorder: (segmentId: string, toIndex: number) => void;
  onRippleDelete: (segmentId: string) => void;
  onRestore: (removedId: string) => void;
}

interface TrimDrag {
  segmentId: string;
  edge: "in" | "out";
  currentMs: number;
}

interface ReorderDrag {
  segmentId: string;
  overIndex: number;
}

/**
 * Output-order timeline. Deliberately pinned dir="ltr" — media time flows
 * left→right universally, even in the RTL UI (see DECISIONS.md).
 * Blocks are kept segments (width ∝ duration); thin red ghosts are removed
 * material (click → reason popover + restore). Drag edges to trim, drag the
 * block body to reorder, split at the playhead from the toolbar.
 */
export function Timeline(props: TimelineProps) {
  const t = useTranslations("editor");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openRemovedId, setOpenRemovedId] = useState<string | null>(null);
  const [trimDrag, setTrimDrag] = useState<TrimDrag | null>(null);
  const [reorderDrag, setReorderDrag] = useState<ReorderDrag | null>(null);

  const outputDurationMs = edlOutputDurationMs(props.edl);
  const activeSegment = segmentAtSource(props.edl, props.sourceMs);
  const outputMs = sourceToOutputMs(props.edl, props.sourceMs);

  // Removed ghosts placed before the first kept block that starts at-or-after
  // their source end (best effort once the user reorders).
  const ghostsBeforeIndex = useMemo(() => {
    const map = new Map<number, RemovedSegment[]>();
    for (const removedSegment of props.edl.removed) {
      let index = props.edl.timeline.findIndex(
        (s) => s.sourceInMs >= removedSegment.sourceOutMs - 1,
      );
      if (index === -1) index = props.edl.timeline.length;
      const list = map.get(index) ?? [];
      list.push(removedSegment);
      map.set(index, list);
    }
    return map;
  }, [props.edl]);

  const pxToMs = (deltaPx: number) => {
    const width = containerRef.current?.clientWidth ?? 1;
    return (deltaPx / width) * outputDurationMs;
  };

  function startTrim(
    event: React.PointerEvent,
    segmentId: string,
    edge: "in" | "out",
    originMs: number,
  ) {
    event.stopPropagation();
    event.preventDefault();
    const startX = event.clientX;
    setTrimDrag({ segmentId, edge, currentMs: originMs });

    const onMove = (move: PointerEvent) => {
      const deltaMs = pxToMs(move.clientX - startX);
      setTrimDrag({ segmentId, edge, currentMs: Math.round(originMs + deltaMs) });
    };
    const onUp = (up: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const deltaMs = pxToMs(up.clientX - startX);
      setTrimDrag(null);
      if (Math.abs(deltaMs) >= 10) {
        props.onTrim(segmentId, edge, Math.round(originMs + deltaMs));
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function startReorder(event: React.PointerEvent, segmentId: string, index: number) {
    const startX = event.clientX;
    let moved = false;

    const computeIndex = (clientX: number) => {
      const container = containerRef.current;
      if (!container) return index;
      const rect = container.getBoundingClientRect();
      const fraction = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const targetMs = fraction * outputDurationMs;
      let acc = 0;
      for (let i = 0; i < props.edl.timeline.length; i++) {
        const s = props.edl.timeline[i]!;
        const duration = s.sourceOutMs - s.sourceInMs;
        if (targetMs < acc + duration / 2) return i;
        acc += duration;
      }
      return props.edl.timeline.length - 1;
    };

    const onMove = (move: PointerEvent) => {
      if (!moved && Math.abs(move.clientX - startX) < 8) return;
      moved = true;
      setReorderDrag({ segmentId, overIndex: computeIndex(move.clientX) });
    };
    const onUp = (up: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setReorderDrag(null);
      if (moved) {
        props.onReorder(segmentId, computeIndex(up.clientX));
      } else {
        // Plain click: select + seek within the block.
        setSelectedId(segmentId);
        const segment = props.edl.timeline[index]!;
        const block = (up.target as HTMLElement).closest("[data-segment]");
        if (block) {
          const rect = block.getBoundingClientRect();
          const fraction = Math.max(0, Math.min(1, (up.clientX - rect.left) / rect.width));
          props.onSeek(
            segment.sourceInMs + fraction * (segment.sourceOutMs - segment.sourceInMs),
          );
        }
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-semibold">{t("timelineTitle")}</h2>
        <button
          type="button"
          disabled={!activeSegment}
          onClick={() => activeSegment && props.onSplit(activeSegment.id, props.sourceMs)}
          className="rounded-lg border border-border px-3 py-1 text-sm disabled:opacity-40"
        >
          {t("splitAtPlayhead")}
        </button>
        {selectedId && (
          <button
            type="button"
            onClick={() => {
              props.onRippleDelete(selectedId);
              setSelectedId(null);
            }}
            className="rounded-lg border border-red-500/50 px-3 py-1 text-sm text-red-500"
          >
            {t("deleteSegment")}
          </button>
        )}
        <span className="ms-auto text-xs text-muted">{t("timelineHint")}</span>
      </div>

      {/* Timeline strip — LTR by design */}
      <div
        dir="ltr"
        ref={containerRef}
        className="relative flex h-20 w-full select-none items-stretch gap-px overflow-visible rounded-xl bg-border/30 p-1"
      >
        {props.edl.timeline.map((segment, index) => {
          const isTrimming = trimDrag?.segmentId === segment.id;
          const inMs =
            isTrimming && trimDrag!.edge === "in" ? trimDrag!.currentMs : segment.sourceInMs;
          const outMs =
            isTrimming && trimDrag!.edge === "out" ? trimDrag!.currentMs : segment.sourceOutMs;
          const widthPct = Math.max(
            0.5,
            ((outMs - inMs) / Math.max(1, outputDurationMs)) * 100,
          );
          const ghosts = ghostsBeforeIndex.get(index) ?? [];
          const isDropTarget = reorderDrag && reorderDrag.overIndex === index;

          return (
            <div key={segment.id} className="flex items-stretch" style={{ width: `${widthPct}%` }}>
              {ghosts.map((ghost) => (
                <RemovedGhost
                  key={ghost.id}
                  ghost={ghost}
                  open={openRemovedId === ghost.id}
                  onToggle={() =>
                    setOpenRemovedId(openRemovedId === ghost.id ? null : ghost.id)
                  }
                  onRestore={() => {
                    props.onRestore(ghost.id);
                    setOpenRemovedId(null);
                  }}
                  reasonLabel={t(`reasons.${ghost.reason}`)}
                />
              ))}
              <div
                data-segment
                onPointerDown={(event) => startReorder(event, segment.id, index)}
                className={`relative min-w-0 flex-1 cursor-grab rounded-lg border-2 transition-colors ${
                  reorderDrag?.segmentId === segment.id
                    ? "opacity-50"
                    : isDropTarget
                      ? "border-accent bg-accent/30"
                      : selectedId === segment.id
                        ? "border-accent bg-accent/25"
                        : segment.id === activeSegment?.id
                          ? "border-accent/60 bg-accent/15"
                          : "border-transparent bg-accent/10 hover:bg-accent/20"
                }`}
                title={`${((outMs - inMs) / 1000).toFixed(1)}s`}
              >
                {/* Trim handles */}
                <div
                  onPointerDown={(event) =>
                    startTrim(event, segment.id, "in", segment.sourceInMs)
                  }
                  className="absolute inset-y-0 left-0 w-2 cursor-ew-resize rounded-s-lg bg-accent/50 hover:bg-accent"
                />
                <div
                  onPointerDown={(event) =>
                    startTrim(event, segment.id, "out", segment.sourceOutMs)
                  }
                  className="absolute inset-y-0 right-0 w-2 cursor-ew-resize rounded-e-lg bg-accent/50 hover:bg-accent"
                />
              </div>
            </div>
          );
        })}
        {/* Trailing ghosts */}
        {(ghostsBeforeIndex.get(props.edl.timeline.length) ?? []).map((ghost) => (
          <RemovedGhost
            key={ghost.id}
            ghost={ghost}
            open={openRemovedId === ghost.id}
            onToggle={() => setOpenRemovedId(openRemovedId === ghost.id ? null : ghost.id)}
            onRestore={() => {
              props.onRestore(ghost.id);
              setOpenRemovedId(null);
            }}
            reasonLabel={t(`reasons.${ghost.reason}`)}
          />
        ))}

        {/* Playhead */}
        {outputMs != null && outputDurationMs > 0 && (
          <div
            className="pointer-events-none absolute inset-y-0 z-10 w-0.5 bg-red-500"
            style={{ left: `${(outputMs / outputDurationMs) * 100}%` }}
          />
        )}
      </div>
    </section>
  );
}

function RemovedGhost(props: {
  ghost: RemovedSegment;
  open: boolean;
  onToggle: () => void;
  onRestore: () => void;
  reasonLabel: string;
}) {
  return (
    <div className="relative flex items-stretch">
      <button
        type="button"
        onClick={props.onToggle}
        className="w-2 shrink-0 rounded-sm bg-red-500/50 hover:bg-red-500"
        aria-label={props.reasonLabel}
      />
      {props.open && (
        <div
          // The popover is prose in the UI language even though the strip
          // itself is pinned LTR.
          dir="auto"
          className="absolute bottom-full left-0 z-30 mb-1 w-64 rounded-xl border border-border bg-card p-3 text-sm shadow-lg"
        >
          <AiDecisionCard segment={props.ghost} onRestore={props.onRestore} />
        </div>
      )}
    </div>
  );
}
