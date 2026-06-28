import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

// One boot-snapshot key's accounting: where the value came from and the work it
// cost. `persisted` workMs is the single batched read amortized ÷ N (directional,
// not per-key truth); `loader` workMs is the real from-scratch load.
const perKeySchema = z.object({
  source: z.enum(["persisted", "loader"]),
  workMs: z.number(),
});

// One first-subscribe cycle's latency, or null when its fixture id was missing
// (the target was skipped, not measured).
const firstSubscribeSchema = z
  .object({
    onFirstSubscribeMs: z.number(),
    loaderMs: z.number(),
  })
  .nullable();

const topLoaderSchema = z.object({
  label: z.string(),
  avgMs: z.number(),
  maxMs: z.number(),
  count: z.number(),
});

// One full benchmark iteration measured in the target backend's own process.
export const iterResultSchema = z.object({
  bootSnapshot: z.object({
    totalMs: z.number(),
    perKey: z.record(z.string(), perKeySchema),
  }),
  firstSubscribe: z.record(z.string(), firstSubscribeSchema),
  eventLoop: z.object({
    maxMs: z.number(),
    p99Ms: z.number(),
    meanMs: z.number(),
  }),
  runtimeProfile: z.object({
    topLoaders: z.array(topLoaderSchema),
  }),
});
export type IterResult = z.infer<typeof iterResultSchema>;

export const bootBenchRunResponseSchema = z.object({
  fixtures: z.object({
    conversationId: z.string().nullable(),
    attemptId: z.string().nullable(),
  }),
  runs: z.object({
    cold: z.array(iterResultSchema).optional(),
    warm: z.array(iterResultSchema).optional(),
  }),
});
export type BootBenchRunResponse = z.infer<typeof bootBenchRunResponseSchema>;

export const bootBenchRunBodySchema = z.object({
  iterations: z.number().int().positive().optional(),
  warmup: z.number().int().nonnegative().optional(),
  mode: z.enum(["cold", "warm", "both"]).optional(),
  conversationId: z.string().optional(),
  attemptId: z.string().optional(),
});
export type BootBenchRunBody = z.infer<typeof bootBenchRunBodySchema>;

export const bootBenchRun = defineEndpoint({
  route: "POST /api/debug/boot-bench/run",
  body: bootBenchRunBodySchema,
  response: bootBenchRunResponseSchema,
});
