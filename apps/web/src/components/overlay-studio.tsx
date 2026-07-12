"use client";

import { useTranslations } from "next-intl";
import { OVERLAY_MARGIN_PCT, type OverlayPosition } from "@merai/core";

const POSITIONS: OverlayPosition[] = ["top-start", "top-end", "bottom-start", "bottom-end"];

export interface OverlayStudioProps {
  /** Signed URL of the uploaded logo, or null if none yet. */
  logoUrl: string | null;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  position: OverlayPosition;
  onPosition: (p: OverlayPosition) => void;
  opacity: number;
  onOpacity: (v: number) => void;
  widthPct: number;
  onWidthPct: (v: number) => void;
}

/** CSS placement mirroring core `logoBox` (margin % of the frame, width % of
 *  frame width) so the preview matches the export. */
function placement(position: OverlayPosition, widthPct: number, opacity: number) {
  const m = `${OVERLAY_MARGIN_PCT * 100}%`;
  const isTop = position.startsWith("top");
  const isStart = position.endsWith("start");
  return {
    position: "absolute" as const,
    width: `${widthPct * 100}%`,
    opacity,
    ...(isTop ? { top: m } : { bottom: m }),
    ...(isStart ? { insetInlineStart: m } : { insetInlineEnd: m }),
  };
}

/**
 * Overlay Studio (Build 6C.3): place the creator's logo / watermark. The
 * preview uses the SAME geometry the worker composites (core `logoBox`), so
 * there is no fake preview — what's shown is what exports.
 */
export function OverlayStudio(props: OverlayStudioProps) {
  const t = useTranslations("overlayStudio");

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
      <label className="flex items-center gap-2 font-semibold">
        <input type="checkbox" checked={props.enabled} onChange={(e) => props.onToggle(e.target.checked)} />
        {t("title")}
      </label>
      <p className="text-sm text-muted">{t("hint")}</p>

      {!props.logoUrl && <p className="text-sm text-muted">{t("uploadFirst")}</p>}

      {props.enabled && props.logoUrl && (
        <div className="grid gap-5 sm:grid-cols-[200px_1fr]">
          {/* Live preview — geometry mirrors the export */}
          <div className="relative mx-auto aspect-[9/16] w-full max-w-[200px] overflow-hidden rounded-xl bg-neutral-800">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={props.logoUrl}
              alt=""
              style={placement(props.position, props.widthPct, props.opacity)}
            />
          </div>

          <div className="flex flex-col gap-4">
            {/* Position picker (2×2, logical corners) */}
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-muted">{t("position")}</span>
              <div className="grid grid-cols-2 gap-1.5">
                {POSITIONS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => props.onPosition(p)}
                    className={`rounded-lg border px-2 py-1.5 text-xs ${
                      props.position === p
                        ? "border-accent bg-accent/15 text-accent"
                        : "border-border text-muted hover:border-accent"
                    }`}
                  >
                    {t(`positions.${p}`)}
                  </button>
                ))}
              </div>
            </div>

            <label className="flex flex-col gap-1.5 text-xs text-muted">
              {t("opacity", { percent: Math.round(props.opacity * 100) })}
              <input
                type="range"
                min={10}
                max={100}
                value={Math.round(props.opacity * 100)}
                onChange={(e) => props.onOpacity(Number(e.target.value) / 100)}
                dir="ltr"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-xs text-muted">
              {t("size", { percent: Math.round(props.widthPct * 100) })}
              <input
                type="range"
                min={8}
                max={35}
                value={Math.round(props.widthPct * 100)}
                onChange={(e) => props.onWidthPct(Number(e.target.value) / 100)}
                dir="ltr"
              />
            </label>
          </div>
        </div>
      )}
    </section>
  );
}
