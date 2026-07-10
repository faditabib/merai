import { z } from "zod";
import {
  aspectRatioSchema,
  edlV1Schema,
  removedSegmentSchema,
  type EdlV1,
} from "./edl";

/**
 * EDL v2 — the multi-track editing model (Build 5).
 *
 * v1 derives output time from array order (ripple, single implicit track);
 * v2 places every clip explicitly on a track at `timelineInMs`, which is the
 * one change that unlocks J/L-cuts (a linked audio clip retimed against its
 * video twin), B-roll (a second video track overlapping the first), music
 * beds (an audio clip spanning many video clips), and transitions.
 *
 * Compatibility contract (see BUILD_5_ANALYSIS.md):
 *  - `upgradeEdlV1ToV2` is total and lossless; ids are preserved.
 *  - `downgradeEdlV2ToV1` succeeds only for v1-representable compositions
 *    and REFUSES with a typed reason otherwise — it never silently drops
 *    tracks, effects, or timing.
 *  - Round-trip law: downgrade(upgrade(v1)) deep-equals v1.
 *  - `parseEdl` is the only sanctioned way to ingest edl_versions.edl jsonb.
 *
 * Writers keep producing v1 until the multi-track UI lands; this module makes
 * every reader version-aware first (expand/contract migration, readers-first).
 */

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export const assetSchema = z.object({
  id: z.string().min(1),
  /** source-upload = the project's raw video; upload/generated arrive with
   *  B-roll and music features. */
  kind: z.enum(["source-upload", "upload", "generated"]),
  uploadId: z.string().uuid().optional(),
  storagePath: z.string().optional(),
  durationMs: z.number().int().nonnegative().optional(),
});
export type Asset = z.infer<typeof assetSchema>;

/** Open effect metadata: renderers ignore unknown types, so new effects need
 *  no schema version bump. */
export const effectRefSchema = z.object({
  type: z.string().min(1),
  params: z.record(z.string(), z.unknown()).default({}),
});
export type EffectRef = z.infer<typeof effectRefSchema>;

export const transitionRefSchema = z.object({
  type: z.string().min(1),
  durationMs: z.number().int().positive(),
  params: z.record(z.string(), z.unknown()).optional(),
});
export type TransitionRef = z.infer<typeof transitionRefSchema>;

export const clipSchema = z
  .object({
    id: z.string().min(1),
    assetId: z.string().min(1),
    /** Explicit output placement, ms. Gaps and overlaps are legal in v2. */
    timelineInMs: z.number().int().nonnegative(),
    /** Window into the asset, ms. Duration = sourceOutMs - sourceInMs. */
    sourceInMs: z.number().int().nonnegative(),
    sourceOutMs: z.number().int().positive(),
    /** A/V lock pairing. A J/L-cut is a linked pair whose windows differ. */
    linkedClipId: z.string().optional(),
    /** Audio gain, dB (music beds / ducking groundwork). */
    gainDb: z.number().optional(),
    /** Word ids from transcripts.words covered by this clip, if speech. */
    wordIds: z.array(z.string()).optional(),
    effects: z.array(effectRefSchema).default([]),
    transitionIn: transitionRefSchema.optional(),
    transitionOut: transitionRefSchema.optional(),
  })
  .refine((c) => c.sourceOutMs > c.sourceInMs, {
    message: "sourceOutMs must be greater than sourceInMs",
  });
export type ClipV2 = z.infer<typeof clipSchema>;

export const trackKindSchema = z.enum(["video", "audio", "caption"]);
export type TrackKind = z.infer<typeof trackKindSchema>;

export const trackSchema = z.object({
  id: z.string().min(1),
  kind: trackKindSchema,
  name: z.string().optional(),
  muted: z.boolean().default(false),
  locked: z.boolean().default(false),
  effects: z.array(effectRefSchema).default([]),
  /** Later tracks render on top of earlier ones (video) / mix in (audio). */
  clips: z.array(clipSchema).default([]),
});
export type TrackV2 = z.infer<typeof trackSchema>;

/** Captions either stay derived from kept words (v1 behavior, the default)
 *  or graduate to explicit caption-track clips (future manual editing). */
export const captionsModeSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("derived-words") }),
  z.object({ mode: z.literal("clips") }),
]);
export type CaptionsMode = z.infer<typeof captionsModeSchema>;

export const edlV2Schema = z.object({
  version: z.literal(2),
  projectId: z.string().uuid(),
  assets: z.array(assetSchema).min(1),
  tracks: z.array(trackSchema),
  captions: captionsModeSchema,
  /** Removed material, restorable from the review UI — unchanged from v1 so
   *  cut transparency (reason + AI note + restore) keeps working. */
  removed: z.array(removedSegmentSchema),
  aspectRatio: aspectRatioSchema,
  captionStyle: z.string(),
});
export type EdlV2 = z.infer<typeof edlV2Schema>;

export type EdlAny = EdlV1 | EdlV2;

// ---------------------------------------------------------------------------
// Version-dispatched parsing — the ONLY sanctioned jsonb ingestion path
// ---------------------------------------------------------------------------

export const edlAnySchema = z.union([edlV1Schema, edlV2Schema]);

/** Parse unknown jsonb into a validated EDL of either version. Throws on
 *  malformed input or unknown versions. */
export function parseEdl(raw: unknown): EdlAny {
  const version = (raw as { version?: unknown })?.version;
  if (version === 1) return edlV1Schema.parse(raw);
  if (version === 2) return edlV2Schema.parse(raw);
  throw new Error(`unsupported EDL version: ${String(version)}`);
}

// ---------------------------------------------------------------------------
// v1 → v2 upgrade (total, lossless, deterministic)
// ---------------------------------------------------------------------------

export const V1_ASSET_ID = "asset-source";
export const V1_VIDEO_TRACK_ID = "video-1";
export const V1_AUDIO_TRACK_ID = "audio-1";

/** Suffix marking the mirrored audio clip of a locked A/V pair created by
 *  upgrade; downgrade relies on it to restore original segment ids. */
const AUDIO_TWIN_SUFFIX = "/a";

export function upgradeEdlV1ToV2(v1: EdlV1): EdlV2 {
  let cursor = 0;
  const videoClips: ClipV2[] = [];
  const audioClips: ClipV2[] = [];
  for (const segment of v1.timeline) {
    const durationMs = segment.sourceOutMs - segment.sourceInMs;
    const base = {
      assetId: V1_ASSET_ID,
      timelineInMs: cursor,
      sourceInMs: segment.sourceInMs,
      sourceOutMs: segment.sourceOutMs,
      effects: [],
      ...(segment.wordIds ? { wordIds: segment.wordIds } : {}),
    };
    videoClips.push({
      ...base,
      id: segment.id,
      linkedClipId: segment.id + AUDIO_TWIN_SUFFIX,
    });
    audioClips.push({
      ...base,
      id: segment.id + AUDIO_TWIN_SUFFIX,
      linkedClipId: segment.id,
    });
    cursor += durationMs;
  }

  return edlV2Schema.parse({
    version: 2,
    projectId: v1.projectId,
    assets: [
      { id: V1_ASSET_ID, kind: "source-upload", uploadId: v1.sourceUploadId },
    ],
    tracks: [
      { id: V1_VIDEO_TRACK_ID, kind: "video", clips: videoClips },
      { id: V1_AUDIO_TRACK_ID, kind: "audio", clips: audioClips },
    ],
    captions: { mode: "derived-words" },
    removed: v1.removed,
    aspectRatio: v1.aspectRatio,
    captionStyle: v1.captionStyle,
  });
}

// ---------------------------------------------------------------------------
// v2 → v1 downgrade (partial — refuses non-representable compositions)
// ---------------------------------------------------------------------------

export type DowngradeRefusalReason =
  | "multiple-video-tracks"
  | "multiple-audio-tracks"
  | "caption-clips"
  | "multiple-assets"
  | "asset-not-source-upload"
  | "timeline-gap-or-overlap"
  | "unlinked-audio"
  | "av-windows-differ"
  | "has-effects"
  | "has-transitions"
  | "has-gain"
  | "muted-track";

export type DowngradeResult =
  | { ok: true; edl: EdlV1 }
  | { ok: false; reason: DowngradeRefusalReason };

/**
 * Collapse a v1-representable v2 back to v1: exactly one video + one audio
 * track forming locked pairs, contiguous from 0, one source-upload asset,
 * no effects/transitions/gain. Anything else is refused with the reason —
 * never silently flattened.
 */
export function downgradeEdlV2ToV1(v2: EdlV2): DowngradeResult {
  const refuse = (reason: DowngradeRefusalReason): DowngradeResult => ({
    ok: false,
    reason,
  });

  if (v2.captions.mode !== "derived-words") return refuse("caption-clips");
  if (v2.assets.length !== 1) return refuse("multiple-assets");
  const asset = v2.assets[0]!;
  if (asset.kind !== "source-upload" || !asset.uploadId) {
    return refuse("asset-not-source-upload");
  }

  const videoTracks = v2.tracks.filter((t) => t.kind === "video");
  const audioTracks = v2.tracks.filter((t) => t.kind === "audio");
  const captionTracks = v2.tracks.filter((t) => t.kind === "caption");
  if (videoTracks.length !== 1) return refuse("multiple-video-tracks");
  if (audioTracks.length !== 1) return refuse("multiple-audio-tracks");
  if (captionTracks.some((t) => t.clips.length > 0)) {
    return refuse("caption-clips");
  }
  const video = videoTracks[0]!;
  const audio = audioTracks[0]!;
  if (video.muted || audio.muted) return refuse("muted-track");
  if (v2.tracks.some((t) => t.effects.length > 0)) return refuse("has-effects");

  const audioById = new Map(audio.clips.map((c) => [c.id, c]));
  const videoClips = [...video.clips].sort(
    (a, b) => a.timelineInMs - b.timelineInMs,
  );
  if (audio.clips.length !== videoClips.length) return refuse("unlinked-audio");

  let cursor = 0;
  const timeline: EdlV1["timeline"] = [];
  for (const clip of videoClips) {
    if (clip.timelineInMs !== cursor) return refuse("timeline-gap-or-overlap");
    if (clip.effects.length > 0) return refuse("has-effects");
    if (clip.transitionIn || clip.transitionOut) return refuse("has-transitions");
    if (clip.gainDb !== undefined) return refuse("has-gain");

    const twin = clip.linkedClipId ? audioById.get(clip.linkedClipId) : undefined;
    if (!twin || twin.linkedClipId !== clip.id) return refuse("unlinked-audio");
    if (
      twin.timelineInMs !== clip.timelineInMs ||
      twin.sourceInMs !== clip.sourceInMs ||
      twin.sourceOutMs !== clip.sourceOutMs
    ) {
      return refuse("av-windows-differ"); // a J/L-cut — genuinely v2-only
    }
    if (twin.effects.length > 0) return refuse("has-effects");
    if (twin.transitionIn || twin.transitionOut) return refuse("has-transitions");
    if (twin.gainDb !== undefined) return refuse("has-gain");

    timeline.push({
      id: clip.id,
      sourceInMs: clip.sourceInMs,
      sourceOutMs: clip.sourceOutMs,
      ...(clip.wordIds ? { wordIds: clip.wordIds } : {}),
    });
    cursor += clip.sourceOutMs - clip.sourceInMs;
  }

  return {
    ok: true,
    edl: edlV1Schema.parse({
      version: 1,
      projectId: v2.projectId,
      sourceUploadId: asset.uploadId,
      timeline,
      removed: v2.removed,
      aspectRatio: v2.aspectRatio,
      captionStyle: v2.captionStyle,
    }),
  };
}

// ---------------------------------------------------------------------------
// Reader conveniences
// ---------------------------------------------------------------------------

/**
 * The v1 view of unknown edl jsonb: v1 rows pass through, representable v2
 * rows are downgraded, anything else (malformed, unknown version, true
 * multi-track) is null. Today's single-track readers use this at every
 * ingestion point instead of blind casts.
 */
export function edlV1ViewOf(raw: unknown): EdlV1 | null {
  let edl: EdlAny;
  try {
    edl = parseEdl(raw);
  } catch {
    return null;
  }
  if (edl.version === 1) return edl;
  const result = downgradeEdlV2ToV1(edl);
  return result.ok ? result.edl : null;
}

/** Output duration of a v2 composition: the furthest clip end across video
 *  tracks (audio/captions never extend the picture in MVP semantics). */
export function edlV2OutputDurationMs(edl: EdlV2): number {
  let end = 0;
  for (const track of edl.tracks) {
    if (track.kind !== "video") continue;
    for (const clip of track.clips) {
      end = Math.max(end, clip.timelineInMs + (clip.sourceOutMs - clip.sourceInMs));
    }
  }
  return end;
}
