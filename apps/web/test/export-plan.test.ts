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

  it("cuts source-ordered timelines with ONE select pass (constant memory)", () => {
    // N-branch trim+concat OOMed on long videos (stress test) — ordered
    // timelines must use the single-pass select graph.
    expect(filter).toContain(
      "[0:v]fps=30,select='between(t,0.000,1.000)+between(t,5.800,7.000)',setpts=N/FRAME_RATE/TB[vc]",
    );
    expect(filter).toContain(
      "[0:a]aselect='between(t,0.000,1.000)+between(t,5.800,7.000)',asetpts=N/SR/TB[ac]",
    );
    expect(filter).not.toContain("concat=n=");
  });

  it("falls back to trim+concat only for reordered timelines", () => {
    const reordered = buildExportPlan({
      edl: { ...edl, timeline: [edl.timeline[1]!, edl.timeline[0]!] },
      words,
    });
    const reorderedFilter =
      reordered.args[reordered.args.indexOf("-filter_complex") + 1]!;
    expect(reorderedFilter).toContain("[0:v]trim=start=5.800:end=7.000");
    expect(reorderedFilter).toContain("concat=n=2:v=1:a=1[vc][ac]");
    expect(reorderedFilter).not.toContain("select=");
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

  it("computes caption windows in OUTPUT time (post-cut)", () => {
    // The 5s silence gap splits the words into two caption lines.
    expect(plan.captions).toHaveLength(2);
    const [first, second] = plan.captions;

    expect(first!.startOutMs).toBe(100); // unchanged before the cut
    // w2 starts at source 6000 → output = 1000 (seg0) + (6000-5800) = 1200
    expect(second!.startOutMs).toBe(1200);
  });

  it("builds ONE contiguous caption sequence (gaps blanked) and ONE overlay", () => {
    // blank, cap0, blank, cap1, trailing blank — covers 0..outputDuration.
    expect(plan.sequence.map((e) => e.file)).toEqual([
      "blank.png",
      "cap0.png",
      "blank.png",
      "cap1.png",
      "blank.png",
    ]);
    const total = plan.sequence.reduce((sum, e) => sum + e.durationMs, 0);
    expect(total).toBe(plan.outputDurationMs);

    // Exactly one overlay filter regardless of caption count — 139
    // per-caption overlays OOMed even native ffmpeg (stress test).
    expect(filter.match(/overlay/g)).toHaveLength(1);
    expect(filter).toContain("[vs][1:v]overlay=0:0[vo]");

    // The sequence rides in as a single concat-demuxer input.
    expect(plan.args.join(" ")).toContain("-f concat -safe 0 -i captions.txt");
    const inputs = plan.args.filter((_, i) => plan.args[i - 1] === "-i");
    expect(inputs).toEqual(["input.mp4", "captions.txt"]);

    expect(plan.concatScript).toContain("ffconcat version 1.0");
    expect(plan.concatScript).toContain("file cap0.png\nduration");
    expect(plan.concatScript.trimEnd().endsWith("file blank.png")).toBe(true);
  });

  it("maps the final overlaid video and encodes x264+aac, faststart, even dims", () => {
    expect(plan.args).toContain("[vo]");
    expect(plan.args.join(" ")).toContain("-c:v libx264 -preset veryfast -crf 23");
    expect(plan.args.join(" ")).toContain("-c:a aac");
    expect(plan.args.join(" ")).toContain("-movflags +faststart");
    expect(plan.args[plan.args.length - 1]).toBe("out.mp4");
    expect(plan.width % 2).toBe(0);
    expect(plan.height % 2).toBe(0);
  });

  it("omits the caption input and overlay entirely when there are no captions", () => {
    const bare = buildExportPlan({
      edl: { ...edl, timeline: edl.timeline.map((s) => ({ ...s, wordIds: [] })) },
      words,
    });
    expect(bare.captions).toHaveLength(0);
    expect(bare.sequence).toHaveLength(0);
    expect(bare.concatScript).toBe("");
    expect(bare.args).toContain("[vs]");
    expect(bare.args.filter((a) => a === "-i")).toHaveLength(1);
  });

  it("reports the ripple output duration", () => {
    expect(plan.outputDurationMs).toBe(1000 + 1200);
  });
});
