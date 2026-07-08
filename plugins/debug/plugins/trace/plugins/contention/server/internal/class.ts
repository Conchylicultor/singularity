import { getContentionSnapshot } from "@plugins/infra/plugins/contention/server";
import { ContentionSnapshotSchema } from "@plugins/infra/plugins/contention/core";
import { defineTraceEventClass } from "@plugins/debug/plugins/trace/plugins/engine/server";

// The contention class: an ASYNC enrich (no captureAtTrip — a cross-process load
// + pg query can't run in the hot path), resolved under the engine's
// runWithoutProfiling scope so its own pg read never re-feeds the profiler.
// Persisted under snapshot.events.contention. getContentionSnapshot is memoized
// ≤1s, so a storm collapses onto one read.
export const contentionClass = defineTraceEventClass({
  id: "contention",
  schema: ContentionSnapshotSchema,
  enrich: () => getContentionSnapshot(),
});
