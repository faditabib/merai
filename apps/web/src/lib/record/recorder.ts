/**
 * Recording core (Build 7.1). Everything computable is pure and unit-tested;
 * the MediaRecorder itself is wrapped as thinly as possible. A recorded take
 * becomes a regular `File` that rides the EXISTING upload pipeline
 * (validate → createProjectWithUpload → tus → transcribe) — the recorder
 * never invents a parallel path.
 */

/** Preference order: quality-first WebM, then Safari's MP4. All of these are
 *  members of ALLOWED_VIDEO_MIME_TYPES container-wise (webm / mp4). */
const MIME_PREFERENCE = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
  "video/mp4",
] as const;

/** Pick the best supported recorder mime. `isSupported` is injectable so the
 *  choice is unit-testable outside a browser. Returns null when nothing is
 *  supported (surfaced as a translated error state). */
export function pickRecorderMimeType(
  isSupported: (mime: string) => boolean,
): string | null {
  for (const mime of MIME_PREFERENCE) {
    if (isSupported(mime)) return mime;
  }
  return null;
}

/** Container of a (possibly codec-qualified) recorder mime — the value the
 *  upload pipeline validates against ALLOWED_VIDEO_MIME_TYPES. */
export function containerOfMime(mime: string): string {
  return mime.split(";")[0]!.trim();
}

export function extensionForMime(mime: string): string {
  return containerOfMime(mime) === "video/mp4" ? "mp4" : "webm";
}

/** Deterministic take filename: recording-take-2.webm */
export function takeFilename(takeNumber: number, mime: string): string {
  return `recording-take-${takeNumber}.${extensionForMime(mime)}`;
}

/**
 * Elapsed-time accounting that EXCLUDES paused stretches. Pure: feed it
 * events with timestamps from any clock. Segments open on start/resume and
 * close on pause/stop.
 */
export interface ElapsedTracker {
  segments: Array<{ start: number; end: number | null }>;
}

export function createElapsedTracker(): ElapsedTracker {
  return { segments: [] };
}

export function trackerStart(t: ElapsedTracker, now: number): void {
  // Idempotent: ignore a start/resume while a segment is open.
  const last = t.segments[t.segments.length - 1];
  if (last && last.end === null) return;
  t.segments.push({ start: now, end: null });
}

export function trackerPause(t: ElapsedTracker, now: number): void {
  const last = t.segments[t.segments.length - 1];
  if (last && last.end === null) last.end = now;
}

export function trackerElapsedMs(t: ElapsedTracker, now: number): number {
  return t.segments.reduce(
    (sum, s) => sum + ((s.end ?? now) - s.start),
    0,
  );
}

/** mm:ss (always LTR-safe digits; the UI pins direction). */
export function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export type RecorderPhase = "recording" | "paused" | "stopped";

export interface RecorderSessionOptions {
  stream: MediaStream;
  mimeType: string;
  /** Auto-stop bound (the 10-minute raw cap). */
  maxDurationMs: number;
  /** Called when the take is complete (stop() or the cap fired). */
  onComplete: (blob: Blob, durationMs: number) => void;
  /** Elapsed tick (~4/s) for the UI timer. */
  onTick?: (elapsedMs: number) => void;
}

export interface RecorderSession {
  pause(): void;
  resume(): void;
  stop(): void;
  readonly phase: RecorderPhase;
}

/**
 * Thin MediaRecorder wrapper: chunked capture, pause/resume (one continuous
 * blob — no stitching), paused-time-excluding elapsed, cap auto-stop.
 */
export function startRecorderSession(opts: RecorderSessionOptions): RecorderSession {
  const chunks: BlobPart[] = [];
  const tracker = createElapsedTracker();
  let phase: RecorderPhase = "recording";

  const recorder = new MediaRecorder(opts.stream, { mimeType: opts.mimeType });
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  recorder.onstop = () => {
    clearInterval(interval);
    trackerPause(tracker, Date.now());
    const elapsed = trackerElapsedMs(tracker, Date.now());
    opts.onComplete(new Blob(chunks, { type: opts.mimeType }), elapsed);
  };

  const interval = setInterval(() => {
    if (phase !== "recording") return;
    const elapsed = trackerElapsedMs(tracker, Date.now());
    opts.onTick?.(elapsed);
    if (elapsed >= opts.maxDurationMs) session.stop();
  }, 250);

  const session: RecorderSession = {
    get phase() {
      return phase;
    },
    pause() {
      if (phase !== "recording") return;
      phase = "paused";
      trackerPause(tracker, Date.now());
      recorder.pause();
    },
    resume() {
      if (phase !== "paused") return;
      phase = "recording";
      trackerStart(tracker, Date.now());
      recorder.resume();
    },
    stop() {
      if (phase === "stopped") return;
      phase = "stopped";
      recorder.stop();
    },
  };

  trackerStart(tracker, Date.now());
  recorder.start(1000); // 1s chunks — bounded memory growth, no giant flush.
  return session;
}
