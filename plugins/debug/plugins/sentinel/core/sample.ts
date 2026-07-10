import { z } from "zod";

// One cluster-vitals sample, emitted into the "cluster" trace ring every
// sentinel tick. `wall` is the wall-clock anchor (Date.now()); the ring's own
// `tMs` is profiler-clock and only joins the containing snapshot's timeline.
//
// Fleet fields are nullable: a gateway or `ps` hiccup must not lose the
// host/pg vitals of the very tick where things are going wrong — the sub-read
// fails into null (and a log line), never the whole sample.
export const ClusterSampleSchema = z.object({
  wall: z.number(),
  loadAvg1: z.number(),
  loadAvg5: z.number(),
  cpuCount: z.number(),
  pgActiveBackends: z.number(),
  pgTotalBackends: z.number(),
  /** Active-backend counts by pg wait_event_type (IO, LWLock, Lock, ...). */
  pgWaitEvents: z.record(z.string(), z.number()),
  pgLocksWaiting: z.number(),
  /** Per-tick deltas; null on the first tick (no baseline yet). */
  pgBlkReadDeltaMs: z.number().nullable(),
  pgXactCommitDelta: z.number().nullable(),
  /** Gateway view; null when the gateway fetch failed this tick. */
  runningBackends: z.number().nullable(),
  totalActiveConns: z.number().nullable(),
  /** `ps` scan; null when the scan failed this tick. */
  inFlightBuilds: z.number().nullable(),
  /**
   * worktree → latest health-sample event-loop p99 (ms). Refreshed every 3rd
   * tick (a disk scan); intermediate ticks carry the previous rollup.
   */
  backendP99: z.record(z.string(), z.number()),
});
export type ClusterSample = z.infer<typeof ClusterSampleSchema>;

// The persisted snapshot section is the ring slice itself: RingEvent[] whose
// `data` is a ClusterSample (the engine persists the slice directly — no
// enrich, no captureAtTrip).
export const ClusterSectionSchema = z.array(
  z.object({ tMs: z.number(), data: ClusterSampleSchema }),
);
export type ClusterSection = z.infer<typeof ClusterSectionSchema>;
