"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { EdlV1, RemovedSegment, TranscriptWord } from "@merai/core";
import { AiDecisionCard } from "./ai-decision-card";

const CARD_WIDTH_PX = 256; // w-64 — keep in sync with the popover class

/** Where to pin the decision card: viewport coords clamped to stay fully
 *  visible, flipped above the word when the space below is too tight
 *  (visual QA bug #1/#3 — the old in-container popover was clipped by the
 *  transcript's own overflow, cutting off the restore button). */
interface CardAnchor {
  removedId: string;
  top: number;
  left: number;
  above: boolean;
}

function anchorFor(removedId: string, button: HTMLElement): CardAnchor {
  const rect = button.getBoundingClientRect();
  const left = Math.min(
    Math.max(8, rect.left + rect.width / 2 - CARD_WIDTH_PX / 2),
    window.innerWidth - CARD_WIDTH_PX - 8,
  );
  const above = window.innerHeight - rect.bottom < 260;
  return {
    removedId,
    left,
    top: above ? rect.top - 6 : rect.bottom + 6,
    above,
  };
}

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
  const [card, setCard] = useState<CardAnchor | null>(null);

  // The card is pinned to viewport coordinates — any scroll or resize would
  // detach it from its word, so close it instead of chasing the anchor.
  useEffect(() => {
    if (!card) return;
    const close = () => setCard(null);
    window.addEventListener("scroll", close, { capture: true, passive: true });
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, { capture: true });
      window.removeEventListener("resize", close);
    };
  }, [card]);

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
          {props.selectedWordIds.length > 0
            ? t("deleteSelected", { count: props.selectedWordIds.length })
            : t("deleteSelectedNone")}
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
            const open = card?.removedId === removedSegment.id;
            return (
              <span key={word.id}>
                <button
                  type="button"
                  onClick={(event) =>
                    setCard(
                      open
                        ? null
                        : anchorFor(removedSegment.id, event.currentTarget),
                    )
                  }
                  className={`rounded px-0.5 line-through ${
                    open
                      ? "bg-red-500/10 text-muted"
                      : "text-muted opacity-60 hover:bg-red-500/10 hover:opacity-100"
                  }`}
                >
                  {word.text}
                </button>{" "}
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

      {/* AI decision card — viewport-pinned so the transcript's own scroll
          container can never clip it (restore stays reachable). */}
      {card &&
        (() => {
          const segment = props.edl.removed.find(
            (s) => s.id === card.removedId,
          );
          if (!segment) return null;
          return (
            <div
              className="fixed z-50 w-64 rounded-xl border border-border bg-card p-3 text-sm shadow-lg"
              style={{
                top: card.top,
                left: card.left,
                transform: card.above ? "translateY(-100%)" : undefined,
              }}
            >
              <AiDecisionCard
                segment={segment}
                onRestore={() => {
                  props.onRestore(card.removedId);
                  setCard(null);
                }}
              />
            </div>
          );
        })()}
    </section>
  );
}
