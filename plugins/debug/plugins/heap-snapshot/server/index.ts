import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { handleHeapStats } from "./internal/handle-heap-stats";
import { handleCaptureSnapshot } from "./internal/handle-capture-snapshot";
import { getHeapStats, captureHeapSnapshot } from "../shared/endpoints";

export default {
  description:
    "On-demand heap inspector: a cheap bun:jsc heapStats() object-type breakdown (GET) plus a heavy full V8 .heapsnapshot dump to disk for offline Chrome DevTools / VS Code analysis (POST). Surfaced as the Debug → Heap pane.",
  httpRoutes: {
    [getHeapStats.route]: handleHeapStats,
    [captureHeapSnapshot.route]: handleCaptureSnapshot,
  },
} satisfies ServerPluginDefinition;
