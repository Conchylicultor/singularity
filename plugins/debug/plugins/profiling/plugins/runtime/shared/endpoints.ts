import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

// Mirrors the recorder's getRuntimeProfile() return shape
// (@plugins/infra/plugins/runtime-profiler/core). A response schema is required
// for useEndpoint/fetchEndpoint to actually return parsed data on the client —
// the server ignores it, so it is client-safe.
const aggregateSchema = z.object({
  label: z.string(),
  count: z.number(),
  totalMs: z.number(),
  maxMs: z.number(),
  lastMs: z.number(),
});

const slowSpanSchema = z.object({
  kind: z.enum(["http", "db", "loader"]),
  label: z.string(),
  durationMs: z.number(),
  atMs: z.number(),
});

const byKind = <T extends z.ZodTypeAny>(item: T) =>
  z.object({ http: z.array(item), db: z.array(item), loader: z.array(item) });

export const runtimeProfileSchema = z.object({
  aggregates: byKind(aggregateSchema),
  slowest: byKind(slowSpanSchema),
  sinceMs: z.number(),
});

export const getRuntimeProfile = defineEndpoint({
  route: "GET /api/debug/profiling/runtime",
  response: runtimeProfileSchema,
});

export const resetRuntimeProfile = defineEndpoint({
  route: "POST /api/debug/profiling/runtime/reset",
});
