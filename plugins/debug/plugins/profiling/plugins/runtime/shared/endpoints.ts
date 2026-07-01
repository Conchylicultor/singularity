import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

// Mirrors the recorder's getRuntimeProfile() return shape
// (@plugins/infra/plugins/runtime-profiler/core). A response schema is required
// for useEndpoint/fetchEndpoint to actually return parsed data on the client —
// the server ignores it, so it is client-safe.
const spanKindSchema = z.enum(["http", "db", "loader", "sub", "push", "flush", "job"]);

const spanRefSchema = z.object({
  kind: spanKindSchema,
  label: z.string(),
});

const parentBreakdownSchema = z.object({
  parent: spanRefSchema,
  count: z.number(),
  totalMs: z.number(),
  maxMs: z.number(),
});

// Per-layer wait charged to an entry (gate/lock name → ms): the wait-vs-work
// split. Absent when the entry never waited.
const waitBreakdownSchema = z.record(z.string(), z.number());

const aggregateSchema = z.object({
  label: z.string(),
  count: z.number(),
  totalMs: z.number(),
  maxMs: z.number(),
  lastMs: z.number(),
  byParent: z.array(parentBreakdownSchema),
  waits: waitBreakdownSchema.optional(),
});

const slowSpanSchema = z.object({
  kind: spanKindSchema,
  label: z.string(),
  durationMs: z.number(),
  atMs: z.number(),
  parent: spanRefSchema.nullable(),
  waits: waitBreakdownSchema.optional(),
});

const byKind = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    http: z.array(item),
    db: z.array(item),
    loader: z.array(item),
    sub: z.array(item),
    push: z.array(item),
    flush: z.array(item),
    job: z.array(item),
  });

export const runtimeProfileSchema = z.object({
  aggregates: byKind(aggregateSchema),
  slowest: byKind(slowSpanSchema),
  sinceMs: z.number(),
  // Elapsed wall-time of the current profiling window (now − sinceMs), computed
  // server-side. `sinceMs` is a process-relative performance.now() value, not an
  // epoch — the client can't derive elapsed from it alone, so the handler does.
  windowMs: z.number(),
});

export const getRuntimeProfile = defineEndpoint({
  route: "GET /api/debug/profiling/runtime",
  response: runtimeProfileSchema,
});

export const resetRuntimeProfile = defineEndpoint({
  route: "POST /api/debug/profiling/runtime/reset",
});
