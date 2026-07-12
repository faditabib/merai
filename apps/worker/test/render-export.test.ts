import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { upgradeEdlV1ToV2, type EdlV1 } from "@merai/core";
import { setDb } from "../src/db";
import { PermanentJobError } from "../src/errors";
import {
  EXPORT_PART_BYTES,
  OutputTooLargeError,
  renderExportWithEngine,
  type RenderExportDeps,
} from "../src/handlers/render-export";
import { RenderAbortedError, type RenderEngine, type RenderRequest } from "../src/render/types";
import { createTestDb, type TestDb } from "./helpers/pglite-db";

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
  setDb(db);
});

afterAll(() => db.end());

async function seedExport(
  overrides: {
    cancelRequested?: boolean;
    /** Replace the stored edl jsonb (Build 5: version-aware ingestion tests). */
    edlJson?: (v1: EdlV1) => unknown;
    /** Branding snapshot written to exports.brand (Build 6B.1). */
    brand?: unknown;
    /** Resolved caption spec snapshot written to exports.caption_config (6B.2). */
    captionConfig?: unknown;
    /** Transcript words so caption images actually rasterize. */
    words?: { id: string; text: string; startMs: number; endMs: number; confidence: number }[];
  } = {},
) {
  const ownerId = await db.seedUser();
  const projectId = await db.seedProject(ownerId, "ready");
  const uploadId = await db.seedUpload(projectId, ownerId, "uploaded");

  const words = overrides.words ?? [];
  const v1: EdlV1 = {
    version: 1,
    projectId,
    sourceUploadId: uploadId,
    timeline: [{ id: "k0", sourceInMs: 0, sourceOutMs: 4000, wordIds: words.map((w) => w.id) }],
    removed: [],
    aspectRatio: "9:16",
    captionStyle: "minimal-white-bottom",
  };
  const edl = overrides.edlJson ? overrides.edlJson(v1) : v1;
  const { rows: edlRows } = await db.query<{ id: string }>(
    `insert into public.edl_versions (project_id, owner_id, version, source, edl)
     values ($1, $2, 1, 'ai', $3) returning id`,
    [projectId, ownerId, JSON.stringify(edl)],
  );
  await db.query(
    `insert into public.transcripts (upload_id, project_id, owner_id, provider, status, words)
     values ($1, $2, $3, 'mock', 'completed', $4::jsonb)`,
    [uploadId, projectId, ownerId, JSON.stringify(words)],
  );
  const { rows: exportRows } = await db.query<{ id: string }>(
    `insert into public.exports
       (project_id, owner_id, edl_version_id, aspect_ratio, caption_style, status, cancel_requested, brand, caption_config)
     values ($1, $2, $3, '9:16', 'minimal-white-bottom', 'pending', $4, $5, $6)
     returning id`,
    [
      projectId,
      ownerId,
      edlRows[0]!.id,
      overrides.cancelRequested ?? false,
      overrides.brand === undefined ? null : JSON.stringify(overrides.brand),
      overrides.captionConfig === undefined ? null : JSON.stringify(overrides.captionConfig),
    ],
  );
  return { ownerId, projectId, exportId: exportRows[0]!.id };
}

function jobFor(ids: { exportId: string; projectId: string; ownerId: string }) {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    type: "render_export",
    payload: ids,
    attempts: 1,
    max_attempts: 3,
  } as never;
}

const stubDeps = (uploaded: { path?: string; bytes?: Uint8Array } = {}): RenderExportDeps => ({
  signSourceUrl: async () => "https://signed.example/input.mp4",
  uploadOutput: async (path, bytes) => {
    uploaded.path = path;
    uploaded.bytes = bytes;
  },
});

describe("render_export handler (stub engine, real DB + migrations)", () => {
  it("renders, uploads, and marks the exports row uploaded with metadata", async () => {
    const ids = await seedExport();
    const progressSeen: number[] = [];
    const engine: RenderEngine = {
      name: "stub",
      async render(request: RenderRequest) {
        expect(request.plan.segments).toHaveLength(1);
        expect(request.sourceUrl).toContain("signed.example");
        await request.onProgress?.(0.5);
        progressSeen.push(0.5);
        return new Uint8Array([1, 2, 3, 4]);
      },
    };
    const uploaded: { path?: string; bytes?: Uint8Array } = {};

    await renderExportWithEngine(jobFor(ids), engine, stubDeps(uploaded));

    expect(uploaded.path).toBe(`${ids.ownerId}/${ids.exportId}.mp4`);
    expect(uploaded.bytes).toHaveLength(4);

    const { rows } = await db.query<{
      status: string;
      progress: string;
      storage_path: string;
      size_bytes: string;
      duration_seconds: string;
    }>("select * from public.exports where id = $1", [ids.exportId]);
    expect(rows[0]).toMatchObject({
      status: "uploaded",
      storage_path: `exports/${ids.ownerId}/${ids.exportId}.mp4`,
    });
    expect(Number(rows[0]!.progress)).toBe(1);
    expect(Number(rows[0]!.size_bytes)).toBe(4);
    expect(Number(rows[0]!.duration_seconds)).toBeCloseTo(4, 5);
    expect(progressSeen).toEqual([0.5]);
  });

  it("is idempotent: an uploaded export never re-renders", async () => {
    const ids = await seedExport();
    await db.query("update public.exports set status = 'uploaded' where id = $1", [
      ids.exportId,
    ]);
    let rendered = false;
    const engine: RenderEngine = {
      name: "stub",
      async render() {
        rendered = true;
        return new Uint8Array([1]);
      },
    };
    await renderExportWithEngine(jobFor(ids), engine, stubDeps());
    expect(rendered).toBe(false);
  });

  it("honours a cancel requested before the render starts", async () => {
    const ids = await seedExport({ cancelRequested: true });
    let rendered = false;
    const engine: RenderEngine = {
      name: "stub",
      async render() {
        rendered = true;
        return new Uint8Array([1]);
      },
    };
    await renderExportWithEngine(jobFor(ids), engine, stubDeps());
    expect(rendered).toBe(false);
    const { rows } = await db.query<{ status: string }>(
      "select status from public.exports where id = $1",
      [ids.exportId],
    );
    expect(rows[0]!.status).toBe("cancelled");
  });

  it("honours a cancel raised mid-render via shouldAbort", async () => {
    const ids = await seedExport();
    const engine: RenderEngine = {
      name: "stub",
      async render(request: RenderRequest) {
        // User clicks cancel while segment 1 is encoding…
        await db.query(
          "update public.exports set cancel_requested = true where id = $1",
          [ids.exportId],
        );
        if (await request.shouldAbort?.()) throw new RenderAbortedError();
        return new Uint8Array([1]);
      },
    };
    await renderExportWithEngine(jobFor(ids), engine, stubDeps());
    const { rows } = await db.query<{ status: string }>(
      "select status from public.exports where id = $1",
      [ids.exportId],
    );
    expect(rows[0]!.status).toBe("cancelled");
  });

  it("falls back to .partN objects when the output is over the per-file cap", async () => {
    const ids = await seedExport();
    const size = EXPORT_PART_BYTES + 1024; // 2 parts: one full, one 1KiB
    const engine: RenderEngine = {
      name: "stub",
      async render() {
        return new Uint8Array(size);
      },
    };
    const uploads: Array<{ path: string; length: number }> = [];
    const deps: RenderExportDeps = {
      signSourceUrl: async () => "https://signed.example/input.mp4",
      uploadOutput: async (path, bytes) => {
        if (!/\.part\d+$/.test(path)) {
          throw new OutputTooLargeError("output upload failed: The object exceeded the maximum allowed size");
        }
        uploads.push({ path, length: bytes.length });
      },
    };

    await renderExportWithEngine(jobFor(ids), engine, deps);

    expect(uploads).toEqual([
      { path: `${ids.ownerId}/${ids.exportId}.mp4.part0`, length: EXPORT_PART_BYTES },
      { path: `${ids.ownerId}/${ids.exportId}.mp4.part1`, length: 1024 },
    ]);
    const { rows } = await db.query<{
      status: string;
      parts: number;
      storage_path: string;
      size_bytes: string;
    }>("select * from public.exports where id = $1", [ids.exportId]);
    expect(rows[0]).toMatchObject({
      status: "uploaded",
      parts: 2,
      storage_path: `exports/${ids.ownerId}/${ids.exportId}.mp4`,
    });
    expect(Number(rows[0]!.size_bytes)).toBe(size);
  });

  it("classifies a cap below the part size as a permanent failure", async () => {
    const ids = await seedExport();
    const engine: RenderEngine = {
      name: "stub",
      async render() {
        return new Uint8Array([1, 2, 3, 4]); // already smaller than one part
      },
    };
    const deps: RenderExportDeps = {
      signSourceUrl: async () => "https://signed.example/input.mp4",
      uploadOutput: async () => {
        throw new OutputTooLargeError("output upload failed: The object exceeded the maximum allowed size");
      },
    };
    await expect(renderExportWithEngine(jobFor(ids), engine, deps)).rejects.toBeInstanceOf(
      PermanentJobError,
    );
  });

  it("classifies a missing exports row as a permanent failure", async () => {
    const ids = await seedExport();
    await expect(
      renderExportWithEngine(
        jobFor({ ...ids, exportId: "00000000-0000-4000-8000-00000000dead" }),
        { name: "stub", render: async () => new Uint8Array([1]) },
        stubDeps(),
      ),
    ).rejects.toBeInstanceOf(PermanentJobError);
  });

  it("renders a stored EDL v2 identically via the downgrade path (Build 5)", async () => {
    const ids = await seedExport({ edlJson: (v1) => upgradeEdlV1ToV2(v1) });
    const engine: RenderEngine = {
      name: "stub",
      async render(request: RenderRequest) {
        // The planner saw a v1 view: same single segment, same window.
        expect(request.plan.segments).toHaveLength(1);
        expect(request.plan.outputDurationMs).toBe(4000);
        return new Uint8Array([9, 9]);
      },
    };
    const uploaded: { path?: string; bytes?: Uint8Array } = {};
    await renderExportWithEngine(jobFor(ids), engine, stubDeps(uploaded));
    expect(uploaded.path).toBe(`${ids.ownerId}/${ids.exportId}.mp4`);
    const { rows } = await db.query<{ status: string }>(
      "select status from public.exports where id = $1",
      [ids.exportId],
    );
    expect(rows[0]!.status).toBe("uploaded");
  });

  it("classifies a true multi-track EDL v2 as a permanent failure (Build 5)", async () => {
    const ids = await seedExport({
      edlJson: (v1) => {
        const v2 = upgradeEdlV1ToV2(v1);
        // B-roll: a second video track — not v1-representable.
        v2.tracks.push({ ...v2.tracks[0]!, id: "video-2", clips: [] });
        return v2;
      },
    });
    await expect(
      renderExportWithEngine(
        jobFor(ids),
        { name: "stub", render: async () => new Uint8Array([1]) },
        stubDeps(),
      ),
    ).rejects.toThrow(/multi-track \(multiple-video-tracks\)/);
  });

  it("classifies malformed edl jsonb as a permanent failure (Build 5)", async () => {
    const ids = await seedExport({ edlJson: () => ({ version: 42, junk: true }) });
    await expect(
      renderExportWithEngine(
        jobFor(ids),
        { name: "stub", render: async () => new Uint8Array([1]) },
        stubDeps(),
      ),
    ).rejects.toBeInstanceOf(PermanentJobError);
  });

  it("stages brand layer PNGs when the export carries a brand snapshot (Build 6B.1)", async () => {
    const ids = await seedExport({
      brand: {
        gradient: { opacity: 0.6, heightPct: 0.35, color: "#000000" },
        lowerThird: {
          name: "د. أحمد",
          title: "استشاري قلب",
          accentColor: "#7C3AED",
          textColor: "#FFFFFF",
        },
      },
    });
    let seenNames: string[] = [];
    const engine: RenderEngine = {
      name: "stub",
      async render(request: RenderRequest) {
        seenNames = request.captionImages.map((i) => i.name);
        // The plan carries both brand layers; each rasterized PNG has bytes.
        expect(request.plan.brandImages).toEqual([
          "brand-gradient.png",
          "brand-lower-third.png",
        ]);
        for (const img of request.captionImages) expect(img.data.length).toBeGreaterThan(0);
        return new Uint8Array([1, 2, 3, 4]);
      },
    };
    await renderExportWithEngine(jobFor(ids), engine, stubDeps());
    expect(seenNames).toContain("brand-gradient.png");
    expect(seenNames).toContain("brand-lower-third.png");
  });

  it("stages no brand layers for an unbranded export (backward compatible)", async () => {
    const ids = await seedExport(); // brand column is null
    let seenNames: string[] = [];
    const engine: RenderEngine = {
      name: "stub",
      async render(request: RenderRequest) {
        seenNames = request.captionImages.map((i) => i.name);
        expect(request.plan.brandImages).toEqual([]);
        return new Uint8Array([1, 2, 3, 4]);
      },
    };
    await renderExportWithEngine(jobFor(ids), engine, stubDeps());
    // No captions (empty wordIds) and no branding → nothing staged.
    expect(seenNames).toEqual([]);
  });

  it("fails safely (permanent) on a malformed brand snapshot", async () => {
    const ids = await seedExport({ brand: { gradient: { opacity: 5, color: "blue" } } });
    await expect(
      renderExportWithEngine(
        jobFor(ids),
        { name: "stub", render: async () => new Uint8Array([1]) },
        stubDeps(),
      ),
    ).rejects.toBeInstanceOf(PermanentJobError);
  });

  it("renders a caption_config snapshot (brand-colored preset) — Build 6B.2", async () => {
    const ids = await seedExport({
      words: [
        { id: "w0", text: "مرحبا", startMs: 200, endMs: 900, confidence: 0.96 },
        { id: "w1", text: "بكم", startMs: 950, endMs: 1600, confidence: 0.96 },
      ],
      captionConfig: {
        token: "brand-box",
        fontFamily: "IBM Plex Sans Arabic",
        fontWeight: 600,
        verticalAnchor: 0.85,
        textColor: "#FFFFFF",
        backgroundColor: "rgba(124,58,237,0.85)",
        uppercaseLatin: false,
        wordLevel: false,
        fontScale: 1.1,
      },
    });
    let capCount = 0;
    const engine: RenderEngine = {
      name: "stub",
      async render(request: RenderRequest) {
        // The real canvas rasterizer ran with the custom spec → caption PNGs.
        capCount = request.captionImages.length;
        return new Uint8Array([1, 2, 3, 4]);
      },
    };
    await renderExportWithEngine(jobFor(ids), engine, stubDeps());
    expect(capCount).toBeGreaterThan(0);
    const { rows } = await db.query<{ status: string }>(
      "select status from public.exports where id = $1",
      [ids.exportId],
    );
    expect(rows[0]!.status).toBe("uploaded");
  });

  it("skips an unavailable logo gracefully (still uploads, no logo layer) — Build 6C.3", async () => {
    const ids = await seedExport({
      words: [{ id: "w0", text: "مرحبا", startMs: 200, endMs: 900, confidence: 0.96 }],
      brand: {
        logo: {
          storagePath: "brand-assets/owner/missing.png",
          position: "bottom-end",
          opacity: 0.9,
          widthPct: 0.18,
        },
      },
    });
    let brandImages: string[] = [];
    const engine: RenderEngine = {
      name: "stub",
      async render(request: RenderRequest) {
        brandImages = request.plan.brandImages;
        return new Uint8Array([1, 2, 3, 4]);
      },
    };
    await renderExportWithEngine(jobFor(ids), engine, stubDeps());
    // The undownloadable logo was dropped from the plan — render still succeeds.
    expect(brandImages).not.toContain("brand-logo.png");
    const { rows } = await db.query<{ status: string }>(
      "select status from public.exports where id = $1",
      [ids.exportId],
    );
    expect(rows[0]!.status).toBe("uploaded");
  });

  it("fails safely (permanent) on a malformed caption_config", async () => {
    // fontScale out of the schema's safe band.
    const ids = await seedExport({ captionConfig: { token: "x", fontScale: 99 } });
    await expect(
      renderExportWithEngine(
        jobFor(ids),
        { name: "stub", render: async () => new Uint8Array([1]) },
        stubDeps(),
      ),
    ).rejects.toBeInstanceOf(PermanentJobError);
  });

  it("propagates engine failures for queue retry (row stays rendering)", async () => {
    const ids = await seedExport();
    const engine: RenderEngine = {
      name: "stub",
      async render() {
        throw new Error("ffmpeg exploded");
      },
    };
    await expect(
      renderExportWithEngine(jobFor(ids), engine, stubDeps()),
    ).rejects.toThrow(/exploded/);
    const { rows } = await db.query<{ status: string }>(
      "select status from public.exports where id = $1",
      [ids.exportId],
    );
    expect(rows[0]!.status).toBe("rendering"); // runner marks failed on exhaustion
  });
});
