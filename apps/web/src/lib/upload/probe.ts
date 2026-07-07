/**
 * Read a video file's duration in the browser without uploading it —
 * loads only metadata via an object URL. This is the client-side half of
 * the 10-minute gate; the authoritative check happens server-side against
 * the transcription provider's measured duration.
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
      finish(Number.isFinite(video.duration) ? video.duration : null);
    };
    video.onerror = () => finish(null);
    video.src = url;
  });
}
