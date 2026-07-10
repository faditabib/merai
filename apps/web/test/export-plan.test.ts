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

describe("buildExportPlan (segment-wise)", () => {
  const plan = buildExportPlan({ edl, words });

  it("renders each kept segment as its own input-seeked ffmpeg run", () => {
    // One giant filter graph OOMed even native ffmpeg on long videos —
    // the plan must never contain select/trim/concat-filter cuts.
    expect(plan.segments).toHaveLength(2);

    const [first, second] = plan.segments;
    expect(first!.args.slice(0, 6)).toEqual([
      "-ss", "0.000", "-t", "1.000", "-i", "input.mp4",
    ]);
    expect(second!.args.slice(0, 6)).toEqual([
      "-ss", "5.800", "-t", "1.200", "-i", "input.mp4",
    ]);
    expect(first!.outputFile).toBe("seg0.mp4");
    expect(second!.outputFile).toBe("seg1.mp4");

    for (const step of plan.segments) {
      const filter = step.args[step.args.indexOf("-filter_complex") + 1]!;
      expect(filter).not.toMatch(/select|trim|concat/);
      expect(filter).toContain(
        "scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280",
      );
      expect(step.args.join(" ")).toContain("-map 0:a");
      expect(step.args.join(" ")).toContain("-c:v libx264 -preset veryfast -crf 23");
    }
  });

  it("clips caption windows to each segment's local time", () => {
    // Global windows: line 1 at 100..~800 (seg0), line 2 at 1200..~2000
    // in output time → local 200..~1000 within seg1 (which starts at 1000).
    expect(plan.captions).toHaveLength(2);
    expect(plan.captions[0]!.startOutMs).toBe(100);
    expect(plan.captions[1]!.startOutMs).toBe(1200);

    const [first, second] = plan.segments;
    expect(first!.captionsScript).toContain("file cap0.png");
    expect(first!.captionsScript).not.toContain("cap1.png");
    expect(first!.captionsScript).toContain("file blank.png\nduration 0.100");
    expect(second!.captionsScript).toContain("file cap1.png");
    expect(second!.captionsScript).not.toContain("cap0.png");
    // seg1-local: caption starts at 1200-1000=200ms.
    expect(second!.captionsScript).toContain("file blank.png\nduration 0.200");

    // Caption sequence rides in as ONE concat-demuxer input + ONE overlay.
    for (const step of plan.segments) {
      expect(step.args.join(" ")).toContain(`-f concat -safe 0 -i ${step.captionsFile}`);
      const filter = step.args[step.args.indexOf("-filter_complex") + 1]!;
      expect(filter.match(/overlay/g)).toHaveLength(1);
    }
  });

  it("caption sequences fully cover each segment (blank-padded, monotonic)", () => {
    for (const step of plan.segments) {
      const durations = [...step.captionsScript!.matchAll(/duration (\d+\.\d+)/g)].map(
        (m) => Math.round(Number(m[1]) * 1000),
      );
      expect(durations.reduce((a, b) => a + b, 0)).toBe(step.durationMs);
      for (const d of durations) expect(d).toBeGreaterThan(0);
    }
  });

  it("joins with a -c copy remux (no second encode)", () => {
    expect(plan.joinScript).toBe(
      "ffconcat version 1.0\nfile seg0.mp4\nfile seg1.mp4\n",
    );
    expect(plan.joinArgs.join(" ")).toBe(
      "-f concat -safe 0 -i join.txt -c copy -movflags +faststart out.mp4",
    );
  });

  it("handles reordered timelines with the same machinery (file order = output order)", () => {
    const reordered = buildExportPlan({
      edl: { ...edl, timeline: [edl.timeline[1]!, edl.timeline[0]!] },
      words,
    });
    expect(reordered.segments[0]!.args.slice(0, 4)).toEqual([
      "-ss", "5.800", "-t", "1.200",
    ]);
    expect(reordered.joinScript).toContain("file seg0.mp4\nfile seg1.mp4");
    // seg0.mp4 now holds the later source material — order preserved by join.
    expect(reordered.segments[0]!.outputFile).toBe("seg0.mp4");
  });

  it("omits the caption input and overlay for caption-less segments", () => {
    const bare = buildExportPlan({
      edl: { ...edl, timeline: edl.timeline.map((s) => ({ ...s, wordIds: [] })) },
      words,
    });
    expect(bare.captions).toHaveLength(0);
    for (const step of bare.segments) {
      expect(step.captionsFile).toBeNull();
      expect(step.captionsScript).toBeNull();
      expect(step.args.filter((a) => a === "-i")).toHaveLength(1);
      expect(step.args).toContain("[vs]");
    }
  });

  it("maps aspect ratios to even-dimensioned resolutions", () => {
    expect(plan.width).toBe(720);
    expect(plan.height).toBe(1280);
    const wide = buildExportPlan({ edl: { ...edl, aspectRatio: "16:9" }, words });
    expect(wide.width).toBe(1280);
    expect(wide.height).toBe(720);
    for (const { width, height } of Object.values(EXPORT_RESOLUTIONS)) {
      expect(width % 2).toBe(0);
      expect(height % 2).toBe(0);
    }
  });

  it("reports the ripple output duration", () => {
    expect(plan.outputDurationMs).toBe(1000 + 1200);
    expect(plan.segments.reduce((sum, s) => sum + s.durationMs, 0)).toBe(
      plan.outputDurationMs,
    );
  });
});
