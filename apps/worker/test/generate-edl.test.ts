import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AiEditPlan, EdlV1 } from "@merai/core";
import type { EditBrain } from "../src/ai-edit/brain";
import { setDb } from "../src/db";
import { PermanentJobError } from "../src/errors";
import { generateEdl } from "../src/handlers/generate-edl";
import { createTestDb, type TestDb } from "./helpers/pglite-db";

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
  setDb(db);
});

afterAll(() => db.end());

const WORDS = [
  { id: "w0", text: "السلام", startMs: 100, endMs: 400, confidence: 0.95 },
  { id: "w1", text: "عليكم", startMs: 450, endMs: 800, confidence: 0.95 },
  { id: "w2", text: "اليوم", startMs: 850, endMs: 1200, confidence: 0.95 },
];

async function seedSuggestion(instruction = "اجعل الفيديو أقصر") {
  const ownerId = await db.seedUser();
  const projectId = await db.seedProject(ownerId, "ready");
  const uploadId = await db.seedUpload(projectId, ownerId, "uploaded");

  const edl: EdlV1 = {
    version: 1,
    projectId,
    sourceUploadId: uploadId,
    timeline: [
      { id: "seg-k0", sourceInMs: 0, sourceOutMs: 900, wordIds: ["w0", "w1"] },
      { id: "seg-k1", sourceInMs: 900, sourceOutMs: 1300, wordIds: ["w2"] },
    ],
    removed: [],
    aspectRatio: "16:9",
    captionStyle: "minimal-white-bottom",
  };
  const { rows: edlRows } = await db.query<{ id: string }>(
    `insert into public.edl_versions (project_id, owner_id, version, source, edl)
     values ($1, $2, 1, 'ai', $3) returning id`,
    [projectId, ownerId, JSON.stringify(edl)],
  );
  await db.query(
    `insert into public.transcripts
       (upload_id, project_id, owner_id, provider, status, words, language_code)
     values ($1, $2, $3, 'mock', 'completed', $4, 'ar')`,
    [uploadId, projectId, ownerId, JSON.stringify(WORDS)],
  );
  const { rows } = await db.query<{ id: string }>(
    `insert into public.ai_suggestions (project_id, owner_id, edl_version_id, instruction)
     values ($1, $2, $3, $4) returning id`,
    [projectId, ownerId, edlRows[0]!.id, instruction],
  );
  return { ownerId, projectId, suggestionId: rows[0]!.id };
}

function jobFor(ids: { suggestionId: string; projectId: string; ownerId: string }) {
  return {
    id: "00000000-0000-4000-8000-000000000002",
    type: "generate_edl",
    payload: ids,
    attempts: 1,
    max_attempts: 3,
  } as never;
}

const stubBrain = (plan: AiEditPlan): EditBrain => ({
  name: "stub-brain",
  plan: async () => plan,
});

async function suggestionRow(id: string) {
  const { rows } = await db.query<{
    status: string;
    goal: string | null;
    commands: unknown;
    explanation: string | null;
    error: string | null;
    model: string | null;
  }>("select status, goal, commands, explanation, error, model from public.ai_suggestions where id = $1", [id]);
  return rows[0]!;
}

describe("generate_edl handler (AI Editing Brain, real DB + migrations)", () => {
  it("stores a validated plan as a ready suggestion", async () => {
    const ids = await seedSuggestion("نسخة تيك توك");
    await generateEdl(
      jobFor(ids),
      stubBrain({
        goal: "tiktok-version",
        commands: [
          { type: "ripple-delete-segment", segmentId: "seg-k1" },
          { type: "set-aspect-ratio", aspectRatio: "9:16" },
          { type: "set-caption-style", styleToken: "karaoke-highlight" },
        ],
        explanation: "قصصنا النهاية وحوّلنا الفيديو إلى صيغة عمودية.",
      }),
    );
    const row = await suggestionRow(ids.suggestionId);
    expect(row.status).toBe("ready");
    expect(row.goal).toBe("tiktok-version");
    expect(row.model).toBe("stub-brain");
    expect(row.commands).toHaveLength(3);
    expect(row.error).toBeNull();
  });

  it("marks the suggestion failed when the plan references unknown ids (no retry burn)", async () => {
    const ids = await seedSuggestion();
    await generateEdl(
      jobFor(ids),
      stubBrain({
        goal: "make-shorter",
        commands: [{ type: "ripple-delete-segment", segmentId: "seg-hallucinated" }],
        explanation: "x",
      }),
    );
    const row = await suggestionRow(ids.suggestionId);
    expect(row.status).toBe("failed");
    expect(row.error).toBe("invalid-plan:unknown-segment");
  });

  it("fails cleanly as ai-unavailable when no brain is configured", async () => {
    const ids = await seedSuggestion();
    await generateEdl(jobFor(ids), null);
    const row = await suggestionRow(ids.suggestionId);
    expect(row.status).toBe("failed");
    expect(row.error).toBe("ai-unavailable");
  });

  it("converges without calling the brain when already terminal (no re-billing)", async () => {
    const ids = await seedSuggestion();
    await db.query(
      "update public.ai_suggestions set status = 'ready' where id = $1",
      [ids.suggestionId],
    );
    let called = false;
    await generateEdl(jobFor(ids), {
      name: "spy",
      plan: async () => {
        called = true;
        throw new Error("should not run");
      },
    });
    expect(called).toBe(false);
  });

  it("classifies a missing suggestion row as a permanent failure", async () => {
    const ids = await seedSuggestion();
    await expect(
      generateEdl(
        jobFor({ ...ids, suggestionId: "00000000-0000-4000-8000-00000000dead" }),
        stubBrain({ goal: "g", commands: [], explanation: "x" }),
      ),
    ).rejects.toBeInstanceOf(PermanentJobError);
  });
});
