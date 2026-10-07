import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { DebugApp } from "@plugins/apps/plugins/debug/plugins/shell/web";
import { heapSnapshotPane } from "./panes";
import { symbol } from "@plugins/ui/plugins/icons/core";

export { heapSnapshotPane } from "./panes";

export default {
  description:
    "Heap inspector debug pane: a cheap bun:jsc object-type breakdown plus an on-demand full V8 .heapsnapshot dump to disk for offline Chrome DevTools / VS Code analysis.",
  contributions: [
    Pane.Register({ pane: heapSnapshotPane }),
    DebugApp.Sidebar({
      id: "heap-snapshot",
      title: "Heap",
      icon: symbol("memory"),
      opens: { pane: heapSnapshotPane, params: {} },
    }),
  ],
  slots: { "debug-heap-snapshot": heapSnapshotPane },
} satisfies PluginDefinition;
