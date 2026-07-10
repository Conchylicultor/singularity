import { defineTraceEventClass } from "@plugins/debug/plugins/trace/plugins/engine/server";
import { ClusterSectionSchema } from "../../core";

// The "cluster" event class is ring-only: the sentinel sampler emits one
// ClusterSample per tick, and the engine persists the slice overlapping any
// trace's window directly (no captureAtTrip, no enrich) — every trace captured
// on main gains a cluster-vitals lane for free (the ring facility's intended
// first consumer). 720 samples ≈ 1h at the default 5s cadence.
export const clusterClass = defineTraceEventClass({
  id: "cluster",
  schema: ClusterSectionSchema,
  ring: { max: 720 },
});
