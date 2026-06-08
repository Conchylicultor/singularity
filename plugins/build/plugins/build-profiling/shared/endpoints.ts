import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

const spanSchema = z.object({
  id: z.string(),
  phase: z.string(),
  label: z.string(),
  startMs: z.number(),
  durationMs: z.number(),
});

export const getBuildRunProfile = defineEndpoint({
  route: "GET /api/build/runs/:id/profile",
  response: z.object({
    spans: z.array(spanSchema),
    totalMs: z.number(),
  }),
});
