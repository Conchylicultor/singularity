import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

const SpanSchema = z.object({
  id: z.string(),
  phase: z.string(),
  plugin: z.string().optional(),
  label: z.string(),
  startMs: z.number(),
  durationMs: z.number(),
});

export const ProfilingDataSchema = z.object({
  spans: z.array(SpanSchema),
  totalMs: z.number(),
});
export type ProfilingData = z.infer<typeof ProfilingDataSchema>;

export const getBootProfiling = defineEndpoint({
  route: "GET /api/debug/profiling/boot",
  response: ProfilingDataSchema,
});
