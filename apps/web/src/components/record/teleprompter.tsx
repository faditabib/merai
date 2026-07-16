"use client";

import { useEffect, useRef } from "react";
import { scrollOffsetPx, type PrompterMode } from "@/lib/record/teleprompter";

export interface TeleprompterOverlayProps {
  mode: PrompterMode;
  script: string;
  /** Session elapsed (pause-excluding) — the authoritative scroll anchor. */
  elapsedMs: number;
  /** True only while actively recording — freezes the scroll when paused. */
  running: boolean;
  speedPxPerSec: number;
  fontPx: number;
}

/**
 * Prompter overlay (Build 7.3). Pure DOM ABOVE the preview video — it can
 * never leak into the recorded MediaStream. `prompter` scrolls the script at
 * a creator-set speed; `notes` renders the same text as a static band.
 *
 * The scroll is rAF-driven with the transform applied imperatively: the
 * elapsed prop (4 ticks/s, pause-excluding) anchors the position and rAF
 * interpolates between ticks. A CSS transition restarted per tick stalled
 * under compositor throttling (found live) — hence no transition here.
 */
export function TeleprompterOverlay(props: TeleprompterOverlayProps) {
  const textRef = useRef<HTMLParagraphElement | null>(null);
  const anchor = useRef({ elapsedMs: 0, at: 0 });

  // Re-anchor whenever the authoritative elapsed changes.
  anchor.current = { elapsedMs: props.elapsedMs, at: performance.now() };

  const { mode, running, speedPxPerSec } = props;
  useEffect(() => {
    if (mode !== "prompter") return;
    let frame = 0;
    const step = () => {
      const el = textRef.current;
      if (el) {
        const extra = running ? performance.now() - anchor.current.at : 0;
        const offset = scrollOffsetPx(anchor.current.elapsedMs + extra, speedPxPerSec);
        el.style.transform = `translateY(-${offset}px)`;
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [mode, running, speedPxPerSec]);

  if (props.mode === "off" || !props.script.trim()) return null;

  if (props.mode === "notes") {
    return (
      <div className="pointer-events-none absolute inset-x-0 top-0 max-h-[45%] overflow-hidden bg-black/65 p-4 backdrop-blur-sm">
        <p
          className="whitespace-pre-wrap leading-relaxed text-white"
          style={{ fontSize: `${props.fontPx}px` }}
        >
          {props.script}
        </p>
      </div>
    );
  }

  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 h-[45%] overflow-hidden bg-black/65 backdrop-blur-sm"
      aria-hidden
    >
      <p
        ref={textRef}
        className="whitespace-pre-wrap px-6 py-4 text-center leading-relaxed text-white"
        style={{
          fontSize: `${props.fontPx}px`,
          // Baseline position from the 4Hz elapsed ticks — functional even
          // where rAF is throttled to zero (embedded panes, hidden tabs);
          // the rAF loop overwrites with smoothed values when frames fire.
          transform: `translateY(-${scrollOffsetPx(props.elapsedMs, speedPxPerSec)}px)`,
        }}
      >
        {props.script}
      </p>
    </div>
  );
}
