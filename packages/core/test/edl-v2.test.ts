import { describe, expect, it } from "vitest";
import {
  applyEditCommand,
  applyEditCommands,
  downgradeEdlV2ToV1,
  edlV1ViewOf,
  edlV2OutputDurationMs,
  edlV2Schema,
  parseEdl,
  upgradeEdlV1ToV2,
  V1_ASSET_ID,
  type EdlV1,
  type EdlV2,
  type TranscriptWord,
} from "../src/index";

function word(id: string, startMs: number, endMs: number): TranscriptWord {
  return { id, text: id, startMs, endMs, confidence: 0.95 };
}

const words: TranscriptWord[] = [
  word("w0", 100, 400),
  word("w1", 450, 800),
  word("w2", 850, 1200),
];

const v1: EdlV1 = {
  version: 1,
  projectId: "11111111-1111-4111-8111-111111111111",
  sourceUploadId: "22222222-2222-4222-8222-222222222222",
  timeline: [
    { id: "seg-k0", sourceInMs: 0, sourceOutMs: 1300, wordIds: ["w0", "w1", "w2"] },
    { id: "seg-k1", sourceInMs: 2900, sourceOutMs: 4200 },
  ],
  removed: [
    { id: "seg-r0", sourceInMs: 1300, sourceOutMs: 2900, reason: "silence" },
  ],
  aspectRatio: "9:16",
  captionStyle: "minimal-white-bottom",
};

describe("parseEdl (version dispatch)", () => {
  it("parses v1 and v2, rejects unknown versions and garbage", () => {
    expect(parseEdl(v1).version).toBe(1);
    expect(parseEdl(upgradeEdlV1ToV2(v1)).version).toBe(2);
    expect(() => parseEdl({ version: 3 })).toThrow(/unsupported EDL version/);
    expect(() => parseEdl(null)).toThrow();
    expect(() => parseEdl({ ...v1, timeline: "nope" })).toThrow();
  });
});

describe("upgradeEdlV1ToV2", () => {
  it("produces linked A/V track pairs at cumulative positions", () => {
    const v2 = upgradeEdlV1ToV2(v1);
    expect(edlV2Schema.parse(v2)).toBeTruthy();

    const video = v2.tracks.find((t) => t.kind === "video")!;
    const audio = v2.tracks.find((t) => t.kind === "audio")!;
    expect(video.clips.map((c) => c.id)).toEqual(["seg-k0", "seg-k1"]);
    // Explicit output placement: seg-k1 starts where seg-k0 ends.
    expect(video.clips[0]!.timelineInMs).toBe(0);
    expect(video.clips[1]!.timelineInMs).toBe(1300);
    // Locked pairs: mutual links, identical windows.
    expect(video.clips[0]!.linkedClipId).toBe(audio.clips[0]!.id);
    expect(audio.clips[0]!.linkedClipId).toBe("seg-k0");
    expect(audio.clips[1]!.sourceInMs).toBe(2900);
    // Provenance survives.
    expect(v2.assets[0]!.uploadId).toBe(v1.sourceUploadId);
    expect(v2.removed).toEqual(v1.removed);
    expect(video.clips[0]!.wordIds).toEqual(["w0", "w1", "w2"]);
  });

  it("keeps the output duration identical to v1", () => {
    expect(edlV2OutputDurationMs(upgradeEdlV1ToV2(v1))).toBe(1300 + 1300);
  });
});

describe("downgradeEdlV2ToV1", () => {
  it("round-trips: downgrade(upgrade(v1)) deep-equals v1", () => {
    const result = downgradeEdlV2ToV1(upgradeEdlV1ToV2(v1));
    expect(result).toEqual({ ok: true, edl: v1 });
  });

  it("refuses a second video track (B-roll) with the reason", () => {
    const v2 = upgradeEdlV1ToV2(v1);
    const broll: EdlV2 = {
      ...v2,
      tracks: [...v2.tracks, { ...v2.tracks[0]!, id: "video-2", clips: [] }],
    };
    expect(downgradeEdlV2ToV1(broll)).toEqual({
      ok: false,
      reason: "multiple-video-tracks",
    });
  });

  it("refuses a J/L-cut (audio window differs from its video twin)", () => {
    const v2 = upgradeEdlV1ToV2(v1);
    const audio = v2.tracks.find((t) => t.kind === "audio")!;
    audio.clips[0] = { ...audio.clips[0]!, sourceInMs: 50 }; // J-cut lead-in
    expect(downgradeEdlV2ToV1(v2)).toEqual({
      ok: false,
      reason: "av-windows-differ",
    });
  });

  it("refuses gaps, effects, transitions, and gain", () => {
    const gap = upgradeEdlV1ToV2(v1);
    gap.tracks[0]!.clips[1] = { ...gap.tracks[0]!.clips[1]!, timelineInMs: 2000 };
    expect(downgradeEdlV2ToV1(gap)).toEqual({
      ok: false,
      reason: "timeline-gap-or-overlap",
    });

    const fx = upgradeEdlV1ToV2(v1);
    fx.tracks[0]!.clips[0]!.effects.push({ type: "color-grade", params: {} });
    expect(downgradeEdlV2ToV1(fx)).toEqual({ ok: false, reason: "has-effects" });

    const fade = upgradeEdlV1ToV2(v1);
    fade.tracks[0]!.clips[0] = {
      ...fade.tracks[0]!.clips[0]!,
      transitionIn: { type: "crossfade", durationMs: 300 },
    };
    expect(downgradeEdlV2ToV1(fade)).toEqual({
      ok: false,
      reason: "has-transitions",
    });

    const gain = upgradeEdlV1ToV2(v1);
    const audio = gain.tracks.find((t) => t.kind === "audio")!;
    audio.clips[0] = { ...audio.clips[0]!, gainDb: -6 };
    expect(downgradeEdlV2ToV1(gain)).toEqual({ ok: false, reason: "has-gain" });
  });

  it("refuses extra assets (music bed groundwork)", () => {
    const v2 = upgradeEdlV1ToV2(v1);
    const music: EdlV2 = {
      ...v2,
      assets: [
        ...v2.assets,
        { id: "asset-music", kind: "upload", storagePath: "music/bed.mp3" },
      ],
    };
    expect(downgradeEdlV2ToV1(music)).toEqual({
      ok: false,
      reason: "multiple-assets",
    });
  });
});

describe("edlV1ViewOf (reader ingestion)", () => {
  it("passes v1 through, downgrades representable v2, nulls the rest", () => {
    expect(edlV1ViewOf(v1)).toEqual(v1);
    expect(edlV1ViewOf(upgradeEdlV1ToV2(v1))).toEqual(v1);

    const broll = upgradeEdlV1ToV2(v1);
    broll.tracks.push({ ...broll.tracks[0]!, id: "video-2", clips: [] });
    expect(edlV1ViewOf(broll)).toBeNull();
    expect(edlV1ViewOf({ version: 7 })).toBeNull();
    expect(edlV1ViewOf(undefined)).toBeNull();
  });

  it("clip ids referenced by assets must exist… (schema sanity)", () => {
    // Not a referential-integrity engine: schema-level checks only. Asset ids
    // are strings; a dangling assetId is a renderer-level concern (documented).
    const v2 = upgradeEdlV1ToV2(v1);
    expect(v2.tracks[0]!.clips.every((c) => c.assetId === V1_ASSET_ID)).toBe(true);
  });
});

describe("edit commands (AI-editing seam)", () => {
  it("routes commands to the existing ops with identical results", () => {
    const viaCommand = applyEditCommand(v1, words, {
      type: "ripple-delete-segment",
      segmentId: "seg-k1",
    });
    expect(viaCommand.timeline.map((s) => s.id)).toEqual(["seg-k0"]);
    expect(viaCommand.removed.some((r) => r.id === "seg-k1" && r.reason === "user")).toBe(
      true,
    );

    const styled = applyEditCommand(v1, words, {
      type: "set-caption-style",
      styleToken: "karaoke-highlight",
    });
    expect(styled.captionStyle).toBe("karaoke-highlight");
  });

  it("applies a batch atomically and rejects malformed commands", () => {
    const result = applyEditCommands(v1, words, [
      { type: "remove-words", wordIds: ["w1"] },
      { type: "set-aspect-ratio", aspectRatio: "16:9" },
    ]);
    expect(result.aspectRatio).toBe("16:9");
    expect(result.timeline.length).toBeGreaterThan(v1.timeline.length); // split by ripple

    expect(() =>
      applyEditCommands(v1, words, [
        { type: "remove-words", wordIds: [] } as never,
      ]),
    ).toThrow();
    expect(() =>
      applyEditCommand(v1, words, { type: "explode" } as never),
    ).toThrow();
  });
});
