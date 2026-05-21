import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

const BuildStepLogSchema = z.object({
  id: z.string(),
  label: z.string(),
  lines: z.array(z.object({
    text: z.string(),
    stream: z.enum(["stdout", "stderr"]),
  })),
  durationMs: z.number(),
  success: z.boolean(),
});

export const BuildLogsResponseSchema = z.object({
  steps: z.array(BuildStepLogSchema),
});

export type BuildStepLog = z.infer<typeof BuildStepLogSchema>;
export type BuildLogsResponse = z.infer<typeof BuildLogsResponseSchema>;

export const getBuildRunLogs = defineEndpoint({
  route: "GET /api/build/runs/:id/logs",
  response: BuildLogsResponseSchema,
});
