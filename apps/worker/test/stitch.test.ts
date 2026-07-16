import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { JobRow } from "@merai/core";
import { setDb } from "../src/db";
import { PermanentJobError } from "../src/errors";
import { stitchWithDeps, type StitchDeps } from "../src/handlers/stitch";
import { createTestDb, type TestDb } from "./helpers/pglite-db";

function jobFor(payload: Record<string, unknown>): JobRow {
  return {
    id: crypto.randomUUID(),
    type: "stitch",
    payload,
    status: "processing",
    attempts: 1,
    max_attempts: 3,
    run_at: new Date().toISOString(),
    locked_at: null,
    locked_by: null,
    last_error: null,
    dedupe_key: null,
    owner_id: null,
    project_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

describe("stitch handler (Build 7.4)", () => {
  let db: TestDb;
  let owner: string;
  let project: string;
  let sceneA: string;
  let sceneB: string;
  let stitchedId: string;
  let stored: { path: string; bytes: Uint8Array; contentType: string } | null;
  let fetched: string[];

  const deps: StitchDeps = {
    async fetchBytes(path) {
      fetched.push(path);
      return new Uint8Array([1, 2, 3]);
    },
    async storeBytes(path, bytes, contentType) {
      stored = { path, bytes, contentType };
    },
    async runStitch(scenes) {
      // Fake join: length encodes the scene count for assertions.
      return new Uint8Array(100 * scenes.length);
    },
  };

  beforeEach(async () => {
    db = await createTestDb();
    setDb(db);
    stored = null;
    fetched = [];
    owner = await db.seedUser();
    project = await db.seedProject(owner, "uploading");
    sceneA = await db.seedUpload(project, owner, "uploaded");
    sceneB = await db.seedUpload(project, owner, "uploaded");
    // The pre-created stitched row (pending, path pre-assigned) — as the
    // createProjectWithScenes action does.
    stitchedId = await db.seedUpload(project, owner, "pending");
  });

  afterEach(async () => {
    await db.end();
  });

  function payload() {
    return {
      projectId: project,
      ownerId: owner,
      uploadIds: [sceneA, sceneB],
      stitchedUploadId: stitchedId,
    };
  }

  it("downloads scenes in order, stores the join, flips rows, enqueues transcribe", async () => {
    await stitchWithDeps(jobFor(payload()), deps);

    // Scenes fetched in payload order.
    expect(fetched).toHaveLength(2);
    expect(fetched[0]).toContain(sceneA);
    expect(fetched[1]).toContain(sceneB);

    // Joined bytes stored at the stitched row's pre-assigned path.
    expect(stored?.path).toContain(stitchedId);
    expect(stored?.bytes.length).toBe(200);
    expect(stored?.contentType).toBe("video/mp4");

    const { rows: uploads } = await db.query<{ status: string; size_bytes: number }>(
      "select status, size_bytes from public.video_uploads where id = $1",
      [stitchedId],
    );
    expect(uploads[0]).toMatchObject({ status: "uploaded", size_bytes: 200 });

    const { rows: projects } = await db.query<{ status: string }>(
      "select status from public.projects where id = $1",
      [project],
    );
    expect(projects[0]!.status).toBe("transcribing");

    const { rows: jobs } = await db.query<{ type: string; payload: { uploadId: string } }>(
      "select type, payload from public.jobs where type = 'transcribe'",
    );
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.payload.uploadId).toBe(stitchedId);
  });

  it("is idempotent: a re-run after success converges without re-stitching", async () => {
    await stitchWithDeps(jobFor(payload()), deps);
    stored = null;
    fetched = [];

    await stitchWithDeps(jobFor(payload()), deps);
    expect(stored).toBeNull(); // no second stitch
    expect(fetched).toHaveLength(0);

    // Still exactly one transcribe job (dedupe key).
    const { rows: jobs } = await db.query(
      "select id from public.jobs where type = 'transcribe'",
    );
    expect(jobs).toHaveLength(1);
  });

  it("permanently fails when a scene is missing", async () => {
    const bad = { ...payload(), uploadIds: [sceneA, crypto.randomUUID()] };
    await expect(stitchWithDeps(jobFor(bad), deps)).rejects.toThrow(PermanentJobError);
  });

  it("permanently fails when a scene never finished uploading", async () => {
    const pending = await db.seedUpload(project, owner, "uploading");
    const bad = { ...payload(), uploadIds: [sceneA, pending] };
    await expect(stitchWithDeps(jobFor(bad), deps)).rejects.toThrow(PermanentJobError);
  });

  it("permanently fails when the stitched row is missing", async () => {
    const bad = { ...payload(), stitchedUploadId: crypto.randomUUID() };
    await expect(stitchWithDeps(jobFor(bad), deps)).rejects.toThrow(PermanentJobError);
  });

  it("does not regress a project already past uploading", async () => {
    await db.query("update public.projects set status = 'ready' where id = $1", [project]);
    await stitchWithDeps(jobFor(payload()), deps);
    const { rows } = await db.query<{ status: string }>(
      "select status from public.projects where id = $1",
      [project],
    );
    expect(rows[0]!.status).toBe("ready");
  });
});
