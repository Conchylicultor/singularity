import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { previewEndpoint, stopPreviewEndpoint } from "../../core/endpoints";
import { startPreview, stopPreview } from "./preview-manager";

export const handlePreview = implement(previewEndpoint, async ({ params }) => {
  const runId = params.id;
  if (!runId) throw new HttpError(400, "Missing id");
  await startPreview(runId);
});

export const handleStopPreview = implement(stopPreviewEndpoint, async ({ params }) => {
  const runId = params.id;
  if (!runId) throw new HttpError(400, "Missing id");
  await stopPreview(runId);
});
