"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { EdlV1, RemovedSegment, TranscriptWord } from "@merai/core";
import { AiDecisionCard } from "./ai-decision-card";

export interface TranscriptPanelProps {
  edl: EdlV1;
  words: TranscriptWord[];
  languageCode: string | null;
  sourceMs: number;
  selectedWordIds: string[];
  onSelectWords: (ids: string[]) => void;
  onSeek: (sourceMs: number) => void;
  onDeleteSelected: () => void;
  onRestore: (removedId: string) => void;
}

/**
 * Text-based editing surface. Words render in transcript order; kept words
 * are clickable (seek) and selectable (click / shift-click range → Delete
 * ripples them out); removed words are struck through and open a popover
 * explaining WHY the AI (or the user) cut them, with one-click restore —
 * the transparency feature.
 */
export function TranscriptPanel(props: TranscriptPanelProps) {
  const t = useTranslations("editor");
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const [openRemovedId, setOpenRemovedId] = useState<string | null>(null);

  const isRtl = (props.languageCode ?? "ar").startsWith("ar");

  // word id → status maps, recomputed when the EDL changes.
  const { keptIds, removedByWordId } = useMemo(() => {
    const kept = new Set<string>();
    for (const segment of props.edl.timeline) {
      for (const id of segment.wordIds ?? []) kept.add(id);
    }
    const removedMap = new Map<string, RemovedSegment>();
    for (const segment of props.edl.removed) {
      for (const id of segment.wordIds ?? []) removedMap.set(id, segment);
    }
    return { keptIds: kept, removedByWordId: removedMap };
  }, [props.edl]);

  const indexById = useMemo(
    () => new Map(props.words.map((w, i) => [w.id, i])),
    [props.words],
  );

  function onWordClick(word: TranscriptWord, shiftKey: boolean) {
    props.onSeek(word.startMs);
    if (shiftKey && anchorId != null) {
      const a = indexById.get(anchorId) ?? 0;
      const b = indexById.get(word.id) ?? 0;
      const [from, to] = a <= b ? [a, b] : [b, a];
      props.onSelectWords(
        props.words
          .slice(from, to + 1)
          .filter((w) => keptIds.has(w.id))
          .map((w) => w.id),
      );
    } else {
      setAnchorId(word.id);
      props.onSelectWords([word.id]);
    }
  }

  const selected = new Set(props.selectedWordIds);
  const activeWordId = props.words.find(
    (w) => props.sourceMs >= w.startMs && props.sourceMs <= w.endMs,
  )?.id;

  return (
    <section className="flex min-h-0 flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">{t("transcriptTitle")}</h2>
        <button
          type="button"
          onClick={props.onDeleteSelected}
          disabled={props.selectedWordIds.length === 0}
          className="rounded-lg border border-border px-3 py-1.5 text-sm text-red-500 disabled:opacity-40"
        >
          {t("deleteSelected", { count: props.selectedWordIds.length })}
        </button>
      </div>
      <p className="text-xs text-muted">{t("transcriptHint")}</p>

      <article
        dir={isRtl ? "rtl" : "ltr"}
        className="max-h-[480px] overflow-y-auto rounded-2xl border border-border bg-card p-5 leading-[2.2]"
      >
        {props.words.map((word) => {
          const removedSegment = removedByWordId.get(word.id);

          if (removedSegment) {
            const open = openRemovedId === removedSegment.id;
            return (
              <span key={word.id} className="relative inline-block">
                <button
                  type="button"
                  onClick={() =>
                    setOpenRemovedId(open ? null : removedSegment.id)
                  }
                  className="rounded px-0.5 text-muted line-through opacity-60 hover:bg-red-500/10 hover:opacity-100"
                >
                  {word.text}
                </button>{" "}
                {open && (
                  <span className="absolute start-0 top-full z-20 mt-1 block w-64 rounded-xl border border-border bg-card p-3 text-sm shadow-lg">
                    <AiDecisionCard
                      segment={removedSegment}
                      onRestore={() => {
                        props.onRestore(removedSegment.id);
                        setOpenRemovedId(null);
                      }}
                    />
                  </span>
                )}
              </span>
            );
          }

          const kept = keptIds.has(word.id);
          return (
            <span key={word.id}>
              <button
                type="button"
                onClick={(event) => kept && onWordClick(word, event.shiftKey)}
                className={`rounded px-0.5 ${
                  !kept
                    ? "cursor-default text-muted/50 line-through"
                    : selected.has(word.id)
                      ? "bg-accent text-accent-foreground"
                      : word.id === activeWordId
                        ? "bg-accent/25"
                        : "hover:bg-accent/10"
                }`}
              >
                {word.text}
              </button>{" "}
            </span>
          );
        })}
      </article>
    </section>
  );
}
