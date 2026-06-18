import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane, openPane } from "@plugins/primitives/plugins/pane/web";
import { DebugApp } from "@plugins/apps/plugins/debug/plugins/shell/web";
import { sidebarNavItem } from "@plugins/primitives/plugins/app-shell/web";
import { MdMemory } from "react-icons/md";
import { heapSnapshotPane } from "./panes";

export { heapSnapshotPane } from "./panes";

export default {
  description:
    "Heap inspector debug pane: a cheap bun:jsc object-type breakdown plus an on-demand full V8 .heapsnapshot dump to disk for offline Chrome DevTools / VS Code analysis.",
  contributions: [
    Pane.Register({ pane: heapSnapshotPane }),
    DebugApp.Sidebar({
      id: "heap-snapshot",
      ...sidebarNavItem({
        title: "Heap",
        icon: MdMemory,
        onClick: () => openPane(heapSnapshotPane, {}, { mode: "root" }),
      }),
    }),
  ],
} satisfies PluginDefinition;
