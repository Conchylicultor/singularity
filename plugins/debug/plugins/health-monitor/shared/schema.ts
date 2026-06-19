import { z } from "zod";
import { SlowOpMarkerSchema } from "@plugins/debug/plugins/slow-ops/core";

// One per-backend health sample. Every field except `worktree` is a number so
// the wire shape maps cleanly onto recharts series. Event-loop values are
// milliseconds (the perf_hooks histogram reports nanoseconds; the sampler
// divides). Memory values are MB.
export const HealthSampleSchema = z.object({
  sampledAt: z.number(), // Date.now() ms epoch
  worktree: z.string(),
  eventLoopP50Ms: z.number(),
  eventLoopP99Ms: z.number(),
  eventLoopMaxMs: z.number(),
  // Real macOS phys_footprint (MB; rss off-darwin) — replaces the old rssMb,
  // which over-counted ~6× on macOS. Pre-cutover JSONL lines lack this field and
  // are dropped by safeParse (a brief history gap as the rolling window refills).
  physFootprintMb: z.number(),
  heapUsedMb: z.number(),
  heapTotalMb: z.number(),
  heapGrowthMb: z.number(), // Δ heapUsed vs prior tick; negative = a GC reclaimed
  gcPreciseCount: z.number(), // perf_hooks 'gc' observer; 0 when unsupported (Bun)
  gcPreciseTotalMs: z.number(),
});
export type HealthSample = z.infer<typeof HealthSampleSchema>;

// One host-level sample. Sampled only on the main backend (the host is shared).
export const HostSampleSchema = z.object({
  sampledAt: z.number(),
  freeMemMb: z.number(),
  totalMemMb: z.number(),
  usedMemMb: z.number(),
  loadAvg1: z.number(),
  loadAvg5: z.number(),
  loadAvg15: z.number(),
  swapInPagesPerSec: z.number(), // macOS vm_stat Swapins delta; 0 elsewhere
  swapOutPagesPerSec: z.number(),
  compressorMb: z.number(),
});
export type HostSample = z.infer<typeof HostSampleSchema>;

export const HealthSeriesSchema = z.object({
  worktree: z.string(),
  samples: z.array(HealthSampleSchema),
  // Slow-op spikes for this backend, overlaid on its metric charts as
  // severity-colored vertical ReferenceLines on the shared time axis.
  slowOpMarkers: z.array(SlowOpMarkerSchema),
});
export type HealthSeries = z.infer<typeof HealthSeriesSchema>;

export const GetHealthDataResponseSchema = z.object({
  series: z.array(HealthSeriesSchema),
  hostSamples: z.array(HostSampleSchema),
  windowMs: z.number(),
});
export type GetHealthDataResponse = z.infer<typeof GetHealthDataResponseSchema>;
