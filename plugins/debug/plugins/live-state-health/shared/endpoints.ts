import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

// The `/api/resources/_debug` route is handled INSIDE the shared resource
// runtime (`handleResourcesDebug` in
// @plugins/framework/plugins/resource-runtime/core) — that handler stays the
// single authoritative source. This endpoint only declares the contract so the
// live-state-health pane can `useEndpoint` it with a parsed, typed response; the
// server ignores the response schema, so it is client-safe.
//
// Mirrors the per-resource shape `handleResourcesDebug` emits. `loaderStats` is
// the server-only frequency hook (absent on central / when the loader never ran
// in the current profiling window).

const loaderStatsSchema = z.object({
  count: z.number(),
  ratePerMin: z.number(),
  maxMs: z.number(),
});

const resourceDebugSchema = z.object({
  key: z.string(),
  mode: z.enum(["push", "invalidate", "keyed"]),
  pluginId: z.string().optional(),
  /** Total subscriptions across all sockets (sum over params-tuples). */
  subscribers: z.number(),
  /** Authoritative per-pk server subscriber count = the diff fan-out factor. */
  subCounts: z.record(z.string(), z.number()),
  /** Per-pk monotonic notify version. */
  versions: z.record(z.string(), z.number()),
  /** Upstream resource keys this entry cascades from. */
  dependsOn: z.array(z.string()),
  /** Downstream resource keys this entry cascades to. */
  downstream: z.array(z.string()),
  /** Loader call frequency over the profiling window (server-only). */
  loaderStats: loaderStatsSchema.optional(),
});

export const resourcesDebugSchema = z.object({
  topoOrder: z.array(z.string()),
  resources: z.array(resourceDebugSchema),
});

export type ResourceDebug = z.infer<typeof resourceDebugSchema>;

export const resourcesDebugEndpoint = defineEndpoint({
  route: "GET /api/resources/_debug",
  response: resourcesDebugSchema,
});
