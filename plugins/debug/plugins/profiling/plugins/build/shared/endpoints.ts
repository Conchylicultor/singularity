import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

const SpanSchema = z.object({
  id: z.string(),
  phase: z.string(),
  label: z.string(),
  startMs: z.number(),
  durationMs: z.number(),
});

export const getBuildProfiling = defineEndpoint({
  route: "GET /api/debug/profiling/build",
  response: z.object({
    spans: z.array(SpanSchema),
    totalMs: z.number(),
  }),
});

export const getBuildRunProfileByWorktree = defineEndpoint({
  route: "GET /api/debug/profiling/build/:worktree/:buildId",
});
