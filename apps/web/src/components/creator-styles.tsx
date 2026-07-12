"use client";

import { useTranslations } from "next-intl";
import {
  CREATOR_STYLES,
  type CreatorStyle,
  type CreatorStyleId,
} from "@merai/core";
import { CreatorStylePreview } from "@/components/creator-style-preview";

export interface CreatorStylesProps {
  selectedId: CreatorStyleId | null;
  onApply: (style: CreatorStyle) => void;
}

/**
 * Creator Styles gallery (Build 6C.2): six one-tap creative identities. Apply
 * seeds the Brand Kit form's live state (colors + caption + gradient), so the
 * whole preview transforms instantly — one click. Saving the form persists it.
 */
export function CreatorStyles(props: CreatorStylesProps) {
  const t = useTranslations("creatorStyles");
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="font-semibold">{t("title")}</h3>
        <p className="text-sm text-muted">{t("subtitle")}</p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {CREATOR_STYLES.map((style) => {
          const selected = props.selectedId === style.id;
          return (
            <div
              key={style.id}
              className={`flex flex-col overflow-hidden rounded-xl border transition ${
                selected ? "border-accent ring-1 ring-accent" : "border-border"
              }`}
            >
              <CreatorStylePreview style={style} sampleText={t("sample")} />
              <div className="flex flex-1 flex-col gap-2 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{t(`names.${style.id}`)}</span>
                  <span className="flex shrink-0 gap-1">
                    {[style.colors.primary, style.colors.accent, style.colors.secondary].map(
                      (c, i) => (
                        <span
                          key={i}
                          className="h-3 w-3 rounded-full border border-border/50"
                          style={{ backgroundColor: c }}
                        />
                      ),
                    )}
                  </span>
                </div>
                <p className="text-xs leading-relaxed text-muted">
                  {t(`taglines.${style.id}`)}
                </p>
                <span className="w-fit rounded bg-border/50 px-1.5 py-0.5 text-[11px] text-muted">
                  {t(`useCases.${style.useCaseKey}`)}
                </span>
                <button
                  type="button"
                  onClick={() => props.onApply(style)}
                  className={`mt-1 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                    selected
                      ? "bg-accent/15 text-accent"
                      : "bg-accent text-accent-foreground hover:opacity-90"
                  }`}
                >
                  {selected ? t("applied") : t("apply")}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted">{t("applyHint")}</p>
    </div>
  );
}
