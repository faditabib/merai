import { describe, expect, it } from "vitest";
import type { EdlV1, TranscriptWord } from "@merai/core";
import { buildExportPlan, EXPORT_RESOLUTIONS } from "../src/lib/export/plan";

function word(id: string, startMs: number, endMs: number): TranscriptWord {
  return { id, text: `كلمة-${id}`, startMs, endMs, confidence: 0.95 };
}

const words: TranscriptWord[] = [
  word("w0", 100, 400),
  word("w1", 450, 800),
  // 5s of removed material between w1 and w2
  word("w2", 6000, 6400),
  word("w3", 6450, 6800),
];

const edl: EdlV1 = {
  version: 1,
  projectId: "11111111-1111-4111-8111-111111111111",
  sourceUploadId: "22222222-2222-4222-8222-222222222222",
  timeline: [
    { id: "k0", sourceInMs: 0, sourceOutMs: 1000, wordIds: ["w0", "w1"] },
    { id: "k1", sourceInMs: 5800, sourceOutMs: 7000, wordIds: ["w2", "w3"] },
  ],
  removed: [{ id: "r0", sourceInMs: 1000, sourceOutMs: 5800, reason: "silence" }],
  aspectRatio: "9:16",
  captionStyle: "minimal-white-bottom",
};

describe("buildExportPlan", () => {
  const plan = buildExportPlan({ edl, words });
  const filter = plan.args[plan.args.indexOf("-filter_complex") + 1]!;

  it("trims and concatenates every kept segment with ms precision", () => {
    expect(filter).toContain("[0:v]trim=start=0.000:end=1.000,setpts=PTS-STARTPTS[v0]");
    expect(filter).toContain("[0:a]atrim=start=5.800:end=7.000,asetpts=PTS-STARTPTS[a1]");
    expect(filter).toContain("[v0][a0][v1][a1]concat=n=2:v=1:a=1[vc][ac]");
  });

  it("scales+crops to the aspect-ratio resolution", () => {
    expect(filter).toContain(
      "scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280",
    );
    expect(plan.width).toBe(720);
    expect(plan.height).toBe(1280);

    const wide = buildExportPlan({ edl: { ...edl, aspectRatio: "16:9" }, words });
    expect(wide.width).toBe(1280);
    expect(wide.height).toBe(720);
    expect(Object.keys(EXPORT_RESOLUTIONS)).toEqual(["9:16", "1:1", "16:9"]);
  });

  it("computes caption overlay windows in OUTPUT time (post-cut)", () => {
    // The 5s silence gap splits the words into two caption lines.
    expect(plan.captions).toHaveLength(2);
    const [first, second] = plan.captions;

    expect(first!.startOutMs).toBe(100); // unchanged before the cut
    // w2 starts at source 6000 → output = 1000 (seg0) + (6000-5800) = 1200
    expect(second!.startOutMs).toBe(1200);
    expect(filter).toContain(
      `overlay=0:0:enable='between(t,${(first!.startOutMs / 1000).toFixed(3)},${(first!.endOutMs / 1000).toFixed(3)})'`,
    );
  });

  it("adds one PNG input per caption line, after the video input", () => {
    const inputs = plan.args.filter((_, i) => plan.args[i - 1] === "-i");
    expect(inputs).toEqual(["input.mp4", "cap0.png", "cap1.png"]);
  });

  it("maps the final overlaid video and encodes x264+aac, faststart, even dims", () => {
    expect(plan.args).toContain("[base2]");
    expect(plan.args.join(" ")).toContain("-c:v libx264 -preset veryfast -crf 23");
    expect(plan.args.join(" ")).toContain("-c:a aac");
    expect(plan.args.join(" ")).toContain("-movflags +faststart");
    expect(plan.args[plan.args.length - 1]).toBe("out.mp4");
    expect(plan.width % 2).toBe(0);
    expect(plan.height % 2).toBe(0);
  });

  it("omits overlays entirely when there are no captions", () => {
    const bare = buildExportPlan({
      edl: { ...edl, timeline: edl.timeline.map((s) => ({ ...s, wordIds: [] })) },
      words,
    });
    expect(bare.captions).toHaveLength(0);
    expect(bare.args).toContain("[base0]");
    expect(bare.args.filter((a) => a === "-i")).toHaveLength(1);
  });

  it("reports the ripple output duration", () => {
    expect(plan.outputDurationMs).toBe(1000 + 1200);
  });
});
