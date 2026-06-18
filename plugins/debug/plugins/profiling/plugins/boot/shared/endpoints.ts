import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

const SpanSchema = z.object({
  id: z.string(),
  phase: z.string(),
  plugin: z.string().optional(),
  label: z.string(),
  startMs: z.number(),
  durationMs: z.number(),
  rssStartMb: z.number().optional(),
  rssEndMb: z.number().optional(),
});

// Phase-boundary memory snapshot — the authoritative per-phase RSS numbers
// (mirrors the profiler's MemoryCheckpoint).
const MemoryCheckpointSchema = z.object({
  label: z.string(),
  atMs: z.number(),
  rssMb: z.number(),
  heapUsedMb: z.number(),
  externalMb: z.number(),
  arrayBuffersMb: z.number(),
});
export type MemoryCheckpoint = z.infer<typeof MemoryCheckpointSchema>;

export const ProfilingDataSchema = z.object({
  spans: z.array(SpanSchema),
  totalMs: z.number(),
  memoryCheckpoints: z.array(MemoryCheckpointSchema),
});
export type ProfilingData = z.infer<typeof ProfilingDataSchema>;

export const getBootProfiling = defineEndpoint({
  route: "GET /api/debug/profiling/boot",
  response: ProfilingDataSchema,
});
