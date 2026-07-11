"use client";

import { useTranslations } from "next-intl";
import type { RemovedSegment } from "@merai/core";

/**
 * The AI decision card (Build 6A trust layer) — one shared explanation shape
 * for both cut surfaces (transcript popover + timeline ghost popover).
 *
 * Everything shown is REAL data from the EDL: localized reason, a
 * plain-language explainer per reason category (i18n), the cut's actual
 * duration, the engine's verbatim note when present, and the confidence
 * score ONLY when the engine recorded one (`RemovedSegment.confidence`,
 * the Build 6A schema hook) — absent data renders nothing, never a fake
 * score.
 */
export function AiDecisionCard(props: {
  segment: RemovedSegment;
  onRestore: () => void;
}) {
  const t = useTranslations("editor");
  const { segment } = props;
  const seconds = ((segment.sourceOutMs - segment.sourceInMs) / 1000).toFixed(1);
  const byUser = segment.reason === "user";

  return (
    <span className="block text-start">
      <span className="block text-[11px] font-medium uppercase tracking-wide text-muted">
        {byUser ? t("aiCard.userTitle") : t("aiCard.title")}
      </span>
      <span className="mt-1 block font-semibold text-red-500">
        {t(`reasons.${segment.reason}`)}
      </span>
      <span className="mt-1 block text-xs leading-relaxed text-muted">
        {t(`reasonExplainers.${segment.reason}`)}
      </span>
      <span className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="rounded-full bg-border/40 px-2 py-0.5 text-[11px] text-muted">
          {t("aiCard.durationCut", { seconds })}
        </span>
        {segment.confidence != null && (
          <span className="rounded-full bg-border/40 px-2 py-0.5 text-[11px] text-muted">
            {t("aiCard.confidence", {
              percent: Math.round(segment.confidence * 100),
            })}
          </span>
        )}
      </span>
      {segment.note && (
        <span className="mt-2 block rounded-lg bg-border/25 p-2 text-xs leading-relaxed text-muted">
          {segment.note}
        </span>
      )}
      <button
        type="button"
        onClick={props.onRestore}
        className="mt-2 block rounded-lg bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground"
      >
        {t("restore")}
      </button>
    </span>
  );
}
