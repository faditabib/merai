// TEMP diagnostic: rebuild the export plan from the saved EDL and run it
// against native ffmpeg to validate + time it. Delete once resolved.
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

  console.log(
    `segments: ${plan.segments.length}, captions: ${plan.captions.length}, output: ${(plan.outputDurationMs / 1000).toFixed(1)}s`,
  );

  mkdirSync(WORK, { recursive: true });
  copyFileSync(SOURCE, join(WORK, "input.mp4"));
  // Transparent placeholder PNGs standing in for the canvas captions.
  execFileSync("ffmpeg", [
    "-y", "-v", "error",
    "-f", "lavfi", "-i", `color=black@0.0:s=${plan.width}x${plan.height},format=rgba`,
    "-frames:v", "1", join(WORK, "blank.png"),
  ]);
  for (const caption of plan.captions) {
    copyFileSync(join(WORK, "blank.png"), join(WORK, caption.file));
  }

  const startedAt = Date.now();
  try {
    for (const step of plan.segments) {
      if (step.captionsFile && step.captionsScript) {
        writeFileSync(join(WORK, step.captionsFile), step.captionsScript);
      }
      const stepStart = Date.now();
      execFileSync("ffmpeg", ["-y", "-v", "error", ...step.args], {
        cwd: WORK,
        stdio: ["ignore", "pipe", "pipe"],
      });
      console.log(
        `  seg${step.index} (${(step.durationMs / 1000).toFixed(1)}s) rendered in ${((Date.now() - stepStart) / 1000).toFixed(1)}s`,
      );
    }
    writeFileSync(join(WORK, plan.joinFile), plan.joinScript);
    const joinStart = Date.now();
    execFileSync("ffmpeg", ["-y", "-v", "error", ...plan.joinArgs], {
      cwd: WORK,
      stdio: ["ignore", "pipe", "pipe"],
    });
    console.log(`  join in ${((Date.now() - joinStart) / 1000).toFixed(1)}s`);
    console.log(
      `NATIVE FFMPEG: SUCCESS in ${((Date.now() - startedAt) / 1000).toFixed(0)}s total`,
    );
  } catch (err) {
    const e = err as { stderr?: Buffer };
    console.log("NATIVE FFMPEG FAILED:\n" + (e.stderr?.toString().slice(-1500) ?? String(err)));
  }
}

void main();
