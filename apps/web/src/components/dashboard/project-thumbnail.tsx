"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const RAW_BUCKET = "raw-uploads";
/** storagePath → JPEG data URL, so revisits/re-renders don't re-decode. */
const cache = new Map<string, string>();

export interface ProjectThumbnailProps {
  /** Latest ready upload path, or null when there's no video yet. */
  storagePath: string | null;
  /** Seed for the placeholder glyph (project title). */
  seed: string;
  className?: string;
}

/**
 * Client-side poster frame (Build 6C.1): grabs the first frame of the project's
 * video with zero backend — lazily (IntersectionObserver), cached, and with a
 * branded placeholder fallback. Only ready projects have a video path; anything
 * that fails to sign/decode simply keeps the placeholder.
 */
export function ProjectThumbnail(props: ProjectThumbnailProps) {
  const { storagePath, seed } = props;
  const [url, setUrl] = useState<string | null>(
    storagePath ? (cache.get(storagePath) ?? null) : null,
  );
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!storagePath || url) return;
    const el = ref.current;
    if (!el) return;
    let cancelled = false;

    const generate = async () => {
      try {
        const objectName = storagePath.slice(RAW_BUCKET.length + 1);
        const { data } = await createClient()
          .storage.from(RAW_BUCKET)
          .createSignedUrl(objectName, 3600);
        if (!data?.signedUrl || cancelled) return;

        const video = document.createElement("video");
        video.crossOrigin = "anonymous";
        video.muted = true;
        video.preload = "metadata";
        video.src = data.signedUrl;

        await new Promise<void>((resolve, reject) => {
          video.onloadedmetadata = () => resolve();
          video.onerror = () => reject(new Error("metadata"));
        });
        // A frame a beat into the clip is more representative than frame 0.
        video.currentTime = Math.min(1, (video.duration || 2) / 2);
        await new Promise<void>((resolve, reject) => {
          video.onseeked = () => resolve();
          video.onerror = () => reject(new Error("seek"));
        });
        if (cancelled) return;

        const w = 320;
        const ratio = video.videoWidth ? video.videoHeight / video.videoWidth : 0.5625;
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = Math.round(w * ratio);
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
        cache.set(storagePath, dataUrl);
        if (!cancelled) setUrl(dataUrl);
      } catch {
        // Keep the placeholder — a missing thumbnail is never an error state.
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          observer.disconnect();
          void generate();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [storagePath, url]);

  return (
    <div
      ref={ref}
      className={`relative overflow-hidden bg-gradient-to-br from-accent/25 via-card to-card ${props.className ?? ""}`}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-3xl font-bold text-accent/50">
          {seed.trim().slice(0, 1).toUpperCase() || "•"}
        </div>
      )}
    </div>
  );
}
