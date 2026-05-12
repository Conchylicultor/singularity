import type { PluginDefinition } from "@core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { DebugApp } from "@plugins/apps/plugins/debug/plugins/shell/web";
import { MdAnnouncement } from "react-icons/md";
import { broadcastsPane } from "./panes";

export { broadcastsPane } from "./panes";

export default {
  id: "debug-broadcasts",
  name: "Broadcasts",
  description: "View and edit cli/broadcasts.json broadcast messages for stale worktrees.",
  contributions: [
    Pane.Register({ pane: broadcastsPane }),
    DebugApp.Sidebar({
      id: "broadcasts",
      title: "Broadcasts",
      icon: MdAnnouncement,
      onClick: () => broadcastsPane.open({}),
    }),
  ],
} satisfies PluginDefinition;
