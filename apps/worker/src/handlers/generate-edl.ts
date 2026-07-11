import {
  edlV1ViewOf,
  generateEdlPayloadSchema,
  transcriptWordsSchema,
  validateAiEditPlan,
  type JobRow,
} from "@merai/core";
import { createEditBrain, type EditBrain } from "../ai-edit/brain";
import { getDb } from "../db";
import { PermanentJobError } from "../errors";
import { log } from "../logger";

/**
 * AI Editing Brain job (Build 5.5). Fills an ai_suggestions row with a
 * validated edit-command plan — it NEVER mutates EDLs; the owner applies
 * the plan in the editor through the normal command dispatcher.
 *
 * Outcome semantics:
 *  - user-facing failures (no AI key, model plan rejected by validation)
 *    mark the suggestion 'failed' and complete the job — retrying cannot
 *    help (temperature 0) and the user sees a clear error;
 *  - structural problems (missing rows) are PermanentJobError;
 *  - transient API errors throw normally → queue retry; a later attempt
 *    continues an in-flight 'processing' suggestion.
 */
export async function generateEdl(
  job: JobRow,
  brainOverride?: EditBrain | null,
): Promise<void> {
  const payload = generateEdlPayloadSchema.parse(job.payload);
  const db = getDb();

  const { rows: suggestionRows } = await db.query<{
    id: string;
    status: string;
    instruction: string;
    edl_version_id: string;
    project_id: string;
  }>(
    "select id, status, instruction, edl_version_id, project_id from public.ai_suggestions where id = $1",
    [payload.suggestionId],
  );
  const suggestion = suggestionRows[0];
  if (!suggestion)
    throw new PermanentJobError(`ai suggestion ${payload.suggestionId} not found`);
  if (!["pending", "processing"].includes(suggestion.status)) {
    log.info(
      `ai-edit: suggestion ${suggestion.id} already ${suggestion.status} — converging`,
    );
    return;
  }

  const fail = async (error: string) => {
    await db.query(
      "update public.ai_suggestions set status = 'failed', error = $2 where id = $1",
      [suggestion.id, error],
    );
    log.warn(`ai-edit: suggestion ${suggestion.id} failed (${error})`);
  };

  const brain = brainOverride !== undefined ? brainOverride : createEditBrain();
  if (!brain) {
    await fail("ai-unavailable");
    return;
  }

  const { rows: edlRows } = await db.query<{ edl: unknown }>(
    "select edl from public.edl_versions where id = $1",
    [suggestion.edl_version_id],
  );
  if (!edlRows[0])
    throw new PermanentJobError(`edl version ${suggestion.edl_version_id} not found`);
  const edl = edlV1ViewOf(edlRows[0].edl);
  if (!edl) {
    await fail("edl-not-editable");
    return;
  }

  const { rows: transcriptRows } = await db.query<{
    words: unknown;
    language_code: string | null;
    analysis: { result?: unknown } | null;
  }>(
    "select words, language_code, analysis from public.transcripts where project_id = $1",
    [suggestion.project_id],
  );
  if (!transcriptRows[0])
    throw new PermanentJobError(`no transcript for project ${suggestion.project_id}`);
  const words = transcriptWordsSchema.parse(transcriptRows[0].words ?? []);

  await db.query(
    "update public.ai_suggestions set status = 'processing' where id = $1",
    [suggestion.id],
  );

  const plan = await brain.plan({
    instruction: suggestion.instruction,
    edl,
    words,
    languageCode: transcriptRows[0].language_code,
    analysisSummary: transcriptRows[0].analysis
      ? JSON.stringify(transcriptRows[0].analysis.result ?? {}).slice(0, 4000)
      : null,
  });

  // The gate: the schema-parsed plan must survive referential checks AND a
  // full dry-run against the exact base EDL before the editor ever sees it.
  const validation = validateAiEditPlan(edl, words, plan);
  if (!validation.ok) {
    await fail(`invalid-plan:${validation.reason}`);
    return;
  }

  await db.query(
    `update public.ai_suggestions
       set status = 'ready', goal = $2, commands = $3, explanation = $4,
           model = $5, error = null
     where id = $1`,
    [
      suggestion.id,
      plan.goal,
      JSON.stringify(plan.commands),
      plan.explanation,
      brain.name,
    ],
  );
  log.info(
    `ai-edit: suggestion ${suggestion.id} ready (goal=${plan.goal}, ${plan.commands.length} commands)`,
  );
}
