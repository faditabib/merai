"use server";

import { randomUUID } from "node:crypto";
import {
  quotaExceeded,
  type SubscriptionTier,
  type UsageKind,
} from "@merai/core";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  safeExtension,
  validateSceneSet,
  validateVideoFile,
  type SceneInput,
} from "@/lib/upload/validate";

/**
 * Server actions for the upload → transcription pipeline.
 * Ownership is enforced by RLS (user-scoped client); only the job enqueue
 * and storage verification use the service-role client.
 *
 * Error strings returned here are i18n keys under upload.errors.* — the UI
 * translates them; nothing user-facing is hardcoded.
 */

const RAW_BUCKET = "raw-uploads";

// ---- Tier enforcement (Build 9) — server-authoritative quota gate. -------

function currentBillingPeriod(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
}

/** The owner's entitled tier + minutes already used this cycle. */
async function usageGate(
  supabase: SupabaseClient,
  ownerId: string,
  kind: UsageKind,
  addedMinutes: number,
): Promise<"quota-exceeded" | null> {
  const [{ data: profile }, { data: ledger }] = await Promise.all([
    supabase.from("profiles").select("subscription_tier").eq("id", ownerId).maybeSingle(),
    supabase
      .from("usage_ledger")
      .select("minutes")
      .eq("owner_id", ownerId)
      .eq("kind", kind)
      .eq("billing_period", currentBillingPeriod()),
  ]);
  const tier = (profile?.subscription_tier ?? "starter") as SubscriptionTier;
  const used = (ledger ?? []).reduce((sum, row) => sum + Number(row.minutes), 0);
  return quotaExceeded(tier, kind, used, addedMinutes) ? "quota-exceeded" : null;
}

export interface CreateUploadResult {
  ok: boolean;
  error?: string;
  projectId?: string;
  uploadId?: string;
  bucket?: string;
  objectName?: string;
}

export async function createProjectWithUpload(input: {
  title: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  durationSeconds: number | null;
}): Promise<CreateUploadResult> {
  const validationError = validateVideoFile(input);
  if (validationError) return { ok: false, error: validationError };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not-authenticated" };

  // Tier gate (Build 9): raw minutes this cycle + this upload.
  const gate = await usageGate(
    supabase,
    user.id,
    "raw_minutes",
    (input.durationSeconds ?? 0) / 60,
  );
  if (gate) return { ok: false, error: gate };

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .insert({
      owner_id: user.id,
      title: input.title,
      status: "uploading",
      source_language: "auto",
    })
    .select("id")
    .single();
  if (projectError || !project) return { ok: false, error: "create-failed" };

  const uploadId = randomUUID();
  const objectName = `${user.id}/${uploadId}/original.${safeExtension(input.filename)}`;

  const { error: uploadError } = await supabase.from("video_uploads").insert({
    id: uploadId,
    project_id: project.id,
    owner_id: user.id,
    storage_path: `${RAW_BUCKET}/${objectName}`,
    original_filename: input.filename,
    mime_type: input.mimeType,
    size_bytes: input.sizeBytes,
    duration_seconds: input.durationSeconds,
    status: "uploading",
  });
  if (uploadError) {
    // Best-effort rollback of the orphaned project row.
    await supabase.from("projects").delete().eq("id", project.id);
    return { ok: false, error: "create-failed" };
  }

  return {
    ok: true,
    projectId: project.id,
    uploadId,
    bucket: RAW_BUCKET,
    objectName,
  };
}

export interface CreateScenesResult {
  ok: boolean;
  error?: string;
  projectId?: string;
  stitchedUploadId?: string;
  bucket?: string;
  /** Per input scene, in order: the upload row id + tus object name. */
  scenes?: Array<{ uploadId: string; objectName: string }>;
}

/**
 * Multi-scene recording project (Build 7.4): one project, N ordered scene
 * uploads, and ONE pre-created 'pending' stitched upload row whose path the
 * worker fills. Zero migrations — the stitched source is an ordinary
 * video_uploads row, so the whole downstream pipeline stays single-source.
 */
export async function createProjectWithScenes(input: {
  title: string;
  scenes: Array<SceneInput & { filename: string }>;
}): Promise<CreateScenesResult> {
  const validationError = validateSceneSet(input.scenes);
  if (validationError) return { ok: false, error: validationError };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not-authenticated" };

  // Tier gate (Build 9): raw minutes this cycle + the combined scenes.
  const totalMinutes =
    input.scenes.reduce((sum, s) => sum + (s.durationSeconds ?? 0), 0) / 60;
  const gate = await usageGate(supabase, user.id, "raw_minutes", totalMinutes);
  if (gate) return { ok: false, error: gate };

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .insert({
      owner_id: user.id,
      title: input.title,
      status: "uploading",
      source_language: "auto",
    })
    .select("id")
    .single();
  if (projectError || !project) return { ok: false, error: "create-failed" };

  const rollback = async () => {
    await supabase.from("projects").delete().eq("id", project.id);
  };

  // Scene rows (order preserved by the returned array).
  const scenes: Array<{ uploadId: string; objectName: string }> = [];
  const sceneRows = input.scenes.map((scene, index) => {
    const uploadId = randomUUID();
    const objectName = `${user.id}/${uploadId}/original.${safeExtension(scene.filename)}`;
    scenes.push({ uploadId, objectName });
    return {
      id: uploadId,
      project_id: project.id,
      owner_id: user.id,
      storage_path: `${RAW_BUCKET}/${objectName}`,
      original_filename: scene.filename || `scene-${index + 1}`,
      mime_type: scene.mimeType,
      size_bytes: scene.sizeBytes,
      duration_seconds: scene.durationSeconds,
      status: "uploading",
    };
  });

  // The stitched source row, pre-created so the worker only fills bytes.
  const stitchedUploadId = randomUUID();
  const totalSeconds = input.scenes.reduce((s, x) => s + (x.durationSeconds ?? 0), 0);
  const { error: uploadsError } = await supabase.from("video_uploads").insert([
    ...sceneRows,
    {
      id: stitchedUploadId,
      project_id: project.id,
      owner_id: user.id,
      storage_path: `${RAW_BUCKET}/${user.id}/${stitchedUploadId}/original.mp4`,
      original_filename: "stitched.mp4",
      mime_type: "video/mp4",
      size_bytes: 0,
      duration_seconds: totalSeconds || null,
      status: "pending",
    },
  ]);
  if (uploadsError) {
    await rollback();
    return { ok: false, error: "create-failed" };
  }

  return {
    ok: true,
    projectId: project.id,
    stitchedUploadId,
    bucket: RAW_BUCKET,
    scenes,
  };
}

/**
 * All scene bytes are in storage → verify each object, mark the scene rows
 * uploaded, and enqueue the stitch job. The project stays 'uploading' until
 * the worker's stitch handler hands off to transcription.
 */
export async function finalizeScenes(input: {
  projectId: string;
  uploadIds: string[];
  stitchedUploadId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not-authenticated" };

  // RLS scopes to the owner — also the ownership check.
  const { data: uploads } = await supabase
    .from("video_uploads")
    .select("id, project_id, storage_path, status")
    .eq("project_id", input.projectId);
  const byId = new Map((uploads ?? []).map((u) => [u.id, u]));
  if (!byId.has(input.stitchedUploadId)) return { ok: false, error: "not-found" };

  const admin = createAdminClient();
  for (const uploadId of input.uploadIds) {
    const upload = byId.get(uploadId);
    if (!upload) return { ok: false, error: "not-found" };
    const objectName = upload.storage_path.slice(RAW_BUCKET.length + 1);
    const folder = objectName.slice(0, objectName.lastIndexOf("/"));
    const filename = objectName.slice(objectName.lastIndexOf("/") + 1);
    const { data: objects, error: listError } = await admin.storage
      .from(RAW_BUCKET)
      .list(folder);
    if (listError || !objects?.some((o) => o.name === filename)) {
      return { ok: false, error: "object-missing" };
    }
  }

  const { error: updateError } = await supabase
    .from("video_uploads")
    .update({ status: "uploaded" })
    .in("id", input.uploadIds);
  if (updateError) return { ok: false, error: "update-failed" };

  const { error: jobError } = await admin.from("jobs").upsert(
    {
      type: "stitch",
      payload: {
        projectId: input.projectId,
        ownerId: user.id,
        uploadIds: input.uploadIds,
        stitchedUploadId: input.stitchedUploadId,
      },
      dedupe_key: `stitch:${input.stitchedUploadId}`,
      owner_id: user.id,
      project_id: input.projectId,
    },
    { onConflict: "dedupe_key", ignoreDuplicates: true },
  );
  if (jobError) return { ok: false, error: "enqueue-failed" };

  return { ok: true };
}

export async function completeUpload(input: {
  uploadId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not-authenticated" };

  // RLS scopes this to the owner — acts as the ownership check.
  const { data: upload } = await supabase
    .from("video_uploads")
    .select("id, project_id, owner_id, storage_path, status")
    .eq("id", input.uploadId)
    .single();
  if (!upload) return { ok: false, error: "not-found" };
  if (upload.status === "uploaded") return { ok: true }; // idempotent

  // Integrity check: the object must actually exist in storage with bytes.
  const admin = createAdminClient();
  const objectName = upload.storage_path.slice(RAW_BUCKET.length + 1);
  const folder = objectName.slice(0, objectName.lastIndexOf("/"));
  const filename = objectName.slice(objectName.lastIndexOf("/") + 1);
  const { data: objects, error: listError } = await admin.storage
    .from(RAW_BUCKET)
    .list(folder);
  const stored = objects?.find((o) => o.name === filename);
  if (listError || !stored) return { ok: false, error: "object-missing" };

  const { error: updateError } = await supabase
    .from("video_uploads")
    .update({ status: "uploaded" })
    .eq("id", upload.id);
  if (updateError) return { ok: false, error: "update-failed" };

  await supabase
    .from("projects")
    .update({ status: "transcribing" })
    .eq("id", upload.project_id);

  // Enqueue transcription — dedupe_key makes double-submits a no-op.
  const { error: jobError } = await admin.from("jobs").upsert(
    {
      type: "transcribe",
      payload: {
        uploadId: upload.id,
        projectId: upload.project_id,
        ownerId: user.id,
      },
      dedupe_key: `transcribe:${upload.id}`,
      owner_id: user.id,
      project_id: upload.project_id,
    },
    { onConflict: "dedupe_key", ignoreDuplicates: true },
  );
  if (jobError) return { ok: false, error: "enqueue-failed" };

  return { ok: true };
}

/**
 * Queue a server-side render for an exports row the owner just created.
 * Ownership is proven by the RLS-scoped select; the enqueue itself needs the
 * service role (users cannot write jobs).
 */
export async function requestExportRender(input: {
  exportId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not-authenticated" };

  const { data: exportRow } = await supabase
    .from("exports")
    .select("id, project_id, owner_id, status")
    .eq("id", input.exportId)
    .single();
  if (!exportRow) return { ok: false, error: "not-found" };

  // Tier gate (Build 9): export minutes this cycle must be under the limit
  // (the render meters the actual output afterwards).
  const gate = await usageGate(supabase, user.id, "export_minutes", 0.01);
  if (gate) return { ok: false, error: gate };

  const admin = createAdminClient();
  const { error: jobError } = await admin.from("jobs").upsert(
    {
      type: "render_export",
      payload: {
        exportId: exportRow.id,
        projectId: exportRow.project_id,
        ownerId: user.id,
      },
      dedupe_key: `render:${exportRow.id}`,
      owner_id: user.id,
      project_id: exportRow.project_id,
    },
    { onConflict: "dedupe_key", ignoreDuplicates: true },
  );
  if (jobError) return { ok: false, error: "enqueue-failed" };

  return { ok: true };
}

/**
 * Queue the AI Editing Brain for an ai_suggestions row the owner just
 * created (Build 5.5). Same shape as requestExportRender: RLS proves
 * ownership, the service role enqueues (users cannot write jobs). The job
 * only fills the suggestion row — applying is a manual editor action.
 */
export async function requestAiEdit(input: {
  suggestionId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not-authenticated" };

  const { data: suggestion } = await supabase
    .from("ai_suggestions")
    .select("id, project_id, owner_id, status")
    .eq("id", input.suggestionId)
    .single();
  if (!suggestion) return { ok: false, error: "not-found" };

  const admin = createAdminClient();
  const { error: jobError } = await admin.from("jobs").upsert(
    {
      type: "generate_edl",
      payload: {
        suggestionId: suggestion.id,
        projectId: suggestion.project_id,
        ownerId: user.id,
      },
      dedupe_key: `ai-edit:${suggestion.id}`,
      owner_id: user.id,
      project_id: suggestion.project_id,
    },
    { onConflict: "dedupe_key", ignoreDuplicates: true },
  );
  if (jobError) return { ok: false, error: "enqueue-failed" };

  return { ok: true };
}

/** Re-run a permanently failed pipeline (error state → transcribing). */
export async function retryProcessing(input: {
  projectId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not-authenticated" };

  const { data: project } = await supabase
    .from("projects")
    .select("id, status")
    .eq("id", input.projectId)
    .single();
  if (!project) return { ok: false, error: "not-found" };

  const { data: upload } = await supabase
    .from("video_uploads")
    .select("id")
    .eq("project_id", project.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (!upload) return { ok: false, error: "not-found" };

  const admin = createAdminClient();

  // Requeue the existing job if it exhausted retries; insert if absent.
  const { data: requeued } = await admin
    .from("jobs")
    .update({ status: "queued", attempts: 0, run_at: new Date().toISOString(), last_error: null })
    .eq("dedupe_key", `transcribe:${upload.id}`)
    .in("status", ["failed", "done"])
    .select("id");

  if (!requeued || requeued.length === 0) {
    const { error: insertError } = await admin.from("jobs").upsert(
      {
        type: "transcribe",
        payload: {
          uploadId: upload.id,
          projectId: project.id,
          ownerId: user.id,
        },
        dedupe_key: `transcribe:${upload.id}`,
        owner_id: user.id,
        project_id: project.id,
      },
      { onConflict: "dedupe_key", ignoreDuplicates: true },
    );
    if (insertError) return { ok: false, error: "enqueue-failed" };
  }

  await supabase
    .from("projects")
    .update({ status: "transcribing" })
    .eq("id", project.id);

  return { ok: true };
}
