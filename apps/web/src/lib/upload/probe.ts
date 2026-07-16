/**
 * Read a video file's duration in the browser without uploading it —
 * loads only metadata via an object URL. This is the client-side half of
 * the 10-minute gate; the authoritative check happens server-side against
 * the transcription provider's measured duration.
 *
 * Chrome's MediaRecorder writes WebM with NO duration header (streamed), so
 * `video.duration` is Infinity for freshly-recorded takes (and for any
 * Chrome-recorded WebM a user uploads). The standard workaround (found live
 * in Build 7.1): seek far past the end — the browser scans the clusters and
 * fixes `duration` to the real value on `seeked`.
 */
export function probeVideoDurationSeconds(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";

    const finish = (duration: number | null) => {
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
      resolve(duration);
    };

    video.onloadedmetadata = () => {
      if (Number.isFinite(video.duration)) {
        finish(video.duration);
        return;
      }
      // Infinity/NaN: force a duration scan via an over-the-end seek.
      video.onseeked = () =>
        finish(Number.isFinite(video.duration) ? video.duration : null);
      video.currentTime = Number.MAX_SAFE_INTEGER;
    };
    video.onerror = () => finish(null);
    video.src = url;
  });
}
