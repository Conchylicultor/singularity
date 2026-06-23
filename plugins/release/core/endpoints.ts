import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

// Trigger a local composition release. Mirrors build's `POST /api/build`, but a
// release is parameterized by (composition, target) so the body carries both.
export const triggerReleaseEndpoint = defineEndpoint({
  route: "POST /api/release",
  body: z.object({ composition: z.string(), target: z.string() }),
});

// Start a local preview of a finished release artifact (spawns its `launch`).
export const previewEndpoint = defineEndpoint({
  route: "POST /api/release/runs/:id/preview",
});

// Stop a running preview (kills the process group, removes its data dir).
export const stopPreviewEndpoint = defineEndpoint({
  route: "POST /api/release/runs/:id/preview/stop",
});

const ReleaseLogLineSchema = z.object({
  text: z.string(),
  stream: z.enum(["stdout", "stderr"]),
});

export const ReleaseLogsResponseSchema = z.object({
  lines: z.array(ReleaseLogLineSchema),
});

export type ReleaseLogLine = z.infer<typeof ReleaseLogLineSchema>;
export type ReleaseLogsResponse = z.infer<typeof ReleaseLogsResponseSchema>;

// Persisted fallback logs for a finished run (the live `/ws/logs` stream only
// covers in-flight runs; after it ends the detail pane reads this).
export const releaseLogsEndpoint = defineEndpoint({
  route: "GET /api/release/runs/:id/logs",
  response: ReleaseLogsResponseSchema,
});
