// TEMP diagnostic: rebuild the failing export plan from the saved EDL and
// run it against native ffmpeg to surface the real error. Delete after use.
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { buildExportPlan } from "../src/lib/export/plan";
import type { EdlV1, TranscriptWord } from "@merai/core";

const PROJECT = "ac5f7ecf-df74-420d-a1be-ab074c5feda4";
const WORK = process.argv[2]!;
const SOURCE = process.argv[3]!;

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.SUPABASE_DB_URL, max: 1 });
  const { rows: edls } = await pool.query(
    `select edl from public.edl_versions where project_id = $1 order by version desc limit 1`,
    [PROJECT],
  );
  const { rows: transcripts } = await pool.query(
    `select words from public.transcripts where project_id = $1`,
    [PROJECT],
  );
  await pool.end();

  const edl = edls[0]!.edl as EdlV1;
  const words = transcripts[0]!.words as TranscriptWord[];
  const plan = buildExportPlan({ edl, words });

  console.log("segments:", edl.timeline.length, "captions:", plan.captions.length);
  console.log("filter_complex chars:", plan.args[plan.args.indexOf("-filter_complex") + 1]!.length);

  mkdirSync(WORK, { recursive: true });
  copyFileSync(SOURCE, join(WORK, "input.mp4"));
  // Transparent placeholder PNGs standing in for the canvas captions.
  execFileSync("ffmpeg", [
    "-y", "-v", "error",
    "-f", "lavfi", "-i", `color=black@0.0:s=${plan.width}x${plan.height},format=rgba`,
    "-frames:v", "1", join(WORK, "cap-template.png"),
  ]);
  for (const caption of plan.captions) {
    copyFileSync(join(WORK, "cap-template.png"), join(WORK, caption.file));
  }
  copyFileSync(join(WORK, "cap-template.png"), join(WORK, "blank.png"));
  if (plan.concatScript) writeFileSync(join(WORK, "captions.txt"), plan.concatScript);

  let args = [...plan.args];
  if (process.env.DEBUG_MODE === "nocap") {
    // Strip the caption input + overlay: isolate the cuts graph.
    const concatIdx = args.indexOf("-f");
    args.splice(concatIdx, 6); // -f concat -safe 0 -i captions.txt
    const filterIdx = args.indexOf("-filter_complex") + 1;
    args[filterIdx] = args[filterIdx]!.replace(/;\[vs\]\[1:v\]overlay=0:0\[vo\]/, "");
    args[args.indexOf("[vo]")] = "[vs]";
  }

  const startedAt = Date.now();
  try {
    execFileSync("ffmpeg", ["-y", "-v", "error", ...args], {
      cwd: WORK,
      stdio: ["ignore", "pipe", "pipe"],
    });
    console.log(
      `NATIVE FFMPEG: SUCCESS in ${((Date.now() - startedAt) / 1000).toFixed(0)}s`,
    );
  } catch (err) {
    const e = err as { stderr?: Buffer };
    console.log("NATIVE FFMPEG FAILED:\n" + (e.stderr?.toString().slice(-1500) ?? String(err)));
  }
}

void main();
