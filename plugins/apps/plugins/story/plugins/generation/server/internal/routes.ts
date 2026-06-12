import { implement } from "@plugins/infra/plugins/endpoints/server";
import { generateUnit } from "../../shared/endpoints";
import { startUnitGeneration } from "./mutations";
import { storyGenerationGenerateJob } from "./generate-job";

// Mark the unit "generating" (recording the turn) and enqueue the durable job.
// Dedup by (pageId, kind, unitId) coalesces double-clicks / regens.
export const handleGenerateUnit = implement(generateUnit, async ({ params, body }) => {
  await startUnitGeneration({
    pageId: params.pageId,
    kind: params.kind,
    unitId: params.unitId,
    inputHash: body.inputHash,
    prompt: body.prompt,
    instruction: body.instruction,
  });
  await storyGenerationGenerateJob.enqueue({
    pageId: params.pageId,
    kind: params.kind,
    unitId: params.unitId,
    prompt: body.prompt,
  });
});
