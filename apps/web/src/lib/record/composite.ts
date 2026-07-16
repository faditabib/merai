import { logoBox, type Box, type OverlayPosition } from "@merai/core";

/**
 * Screen + camera compositing (Build 7.2). For `screen-camera` mode both
 * streams draw onto ONE canvas; the camera is a PiP bubble whose geometry is
 * core's `logoBox` — the exact corner/margin/width math the brand logo layer
 * uses. One canvas stream feeds the 7.1 RecorderSession unchanged, so the
 * result is ONE blob riding the existing single-source pipeline.
 * The recording preview renders this same canvas: preview = output.
 */

export type RecordMode = "camera" | "screen" | "screen-camera";

export const RECORD_MODES: readonly RecordMode[] = [
  "camera",
  "screen",
  "screen-camera",
];

/** Which capture streams a mode needs. */
export function streamsForMode(mode: RecordMode): {
  camera: boolean;
  screen: boolean;
} {
  return {
    camera: mode === "camera" || mode === "screen-camera",
    screen: mode === "screen" || mode === "screen-camera",
  };
}

export const PIP_WIDTH_MIN = 0.12;
export const PIP_WIDTH_MAX = 0.35;
export const PIP_WIDTH_DEFAULT = 0.22;

export function clampPipWidth(widthPct: number): number {
  if (!Number.isFinite(widthPct)) return PIP_WIDTH_DEFAULT;
  return Math.min(PIP_WIDTH_MAX, Math.max(PIP_WIDTH_MIN, widthPct));
}

/**
 * PiP bubble placement — literally the brand-logo geometry applied to the
 * camera: same margins, same widthPct semantics, same corners.
 */
export function pipBox(
  position: OverlayPosition,
  widthPct: number,
  camAspect: number, // h/w of the camera feed
  frameW: number,
  frameH: number,
): Box {
  return logoBox(position, clampPipWidth(widthPct), camAspect, frameW, frameH);
}

/** Output canvas size: the screen's native size capped at 1920 wide. */
export function compositeFrameSize(
  screenW: number,
  screenH: number,
): { w: number; h: number } {
  const safeW = screenW > 0 ? screenW : 1280;
  const safeH = screenH > 0 ? screenH : 720;
  if (safeW <= 1920) return { w: even(safeW), h: even(safeH) };
  const scale = 1920 / safeW;
  return { w: 1920, h: even(safeH * scale) };
}

function even(n: number): number {
  const r = Math.round(n);
  return r % 2 === 0 ? r : r - 1; // encoders want even dimensions
}

export interface CompositeOptions {
  screenStream: MediaStream;
  /** Absent in pure `screen` mode. */
  cameraStream: MediaStream | null;
  /** Mic stream mixed into the output audio (display audio joins if present). */
  micStream: MediaStream | null;
  pip: { position: OverlayPosition; widthPct: number };
  fps?: number;
  /** Fired when the user ends the share from the browser UI. */
  onScreenEnded?: () => void;
}

export interface CompositeHandle {
  stream: MediaStream;
  /** The canvas being recorded — attach it as the live preview. */
  canvas: HTMLCanvasElement;
  stop(): void;
}

/**
 * Build the composite MediaStream: screen (full frame) + camera bubble +
 * mixed audio. Interval-driven draw loop (rAF throttles in background tabs,
 * which would freeze a recording).
 */
export function createCompositeStream(opts: CompositeOptions): CompositeHandle {
  const fps = opts.fps ?? 30;

  const screenTrack = opts.screenStream.getVideoTracks()[0];
  const settings = screenTrack?.getSettings() ?? {};
  const { w, h } = compositeFrameSize(settings.width ?? 0, settings.height ?? 0);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  const screenVideo = attachVideo(opts.screenStream);
  const cameraVideo = opts.cameraStream ? attachVideo(opts.cameraStream) : null;

  const camSettings = opts.cameraStream?.getVideoTracks()[0]?.getSettings() ?? {};
  const camAspect =
    camSettings.width && camSettings.height
      ? camSettings.height / camSettings.width
      : 9 / 16;

  const bubble = pipBox(opts.pip.position, opts.pip.widthPct, camAspect, w, h);
  const radius = Math.min(bubble.w, bubble.h) * 0.12;

  const interval = setInterval(() => {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    drawCover(ctx, screenVideo, { x: 0, y: 0, w, h }, 0, "contain");
    if (cameraVideo) drawCover(ctx, cameraVideo, bubble, radius, "cover");
  }, Math.round(1000 / fps));

  // Browser-native "stop sharing" must end the take gracefully, never lose it.
  if (screenTrack) {
    screenTrack.onended = () => opts.onScreenEnded?.();
  }

  // Audio: mic + display audio (when the OS/browser provides one) → one track.
  const audioCtx = new AudioContext();
  const dest = audioCtx.createMediaStreamDestination();
  let audioSources = 0;
  for (const source of [opts.micStream, opts.screenStream]) {
    if (source && source.getAudioTracks().length > 0) {
      audioCtx.createMediaStreamSource(source).connect(dest);
      audioSources += 1;
    }
  }

  const stream = new MediaStream([
    ...canvas.captureStream(fps).getVideoTracks(),
    ...(audioSources > 0 ? dest.stream.getAudioTracks() : []),
  ]);

  return {
    stream,
    canvas,
    stop() {
      clearInterval(interval);
      screenVideo.srcObject = null;
      if (cameraVideo) cameraVideo.srcObject = null;
      void audioCtx.close();
    },
  };
}

function attachVideo(stream: MediaStream): HTMLVideoElement {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  void video.play();
  return video;
}

/** Draw a video into a box: cover (crop) for the bubble, contain (letterbox)
 *  for the screen, with an optional rounded clip. */
function drawCover(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  box: Box,
  radius: number,
  fit: "cover" | "contain",
): void {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return;

  ctx.save();
  if (radius > 0) {
    ctx.beginPath();
    roundedRectPath(ctx, box, radius);
    ctx.clip();
  }

  const scale =
    fit === "cover"
      ? Math.max(box.w / vw, box.h / vh)
      : Math.min(box.w / vw, box.h / vh);
  const dw = vw * scale;
  const dh = vh * scale;
  const dx = box.x + (box.w - dw) / 2;
  const dy = box.y + (box.h - dh) / 2;
  ctx.drawImage(video, dx, dy, dw, dh);
  ctx.restore();
}

function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  box: Box,
  r: number,
): void {
  const { x, y, w, h } = box;
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
