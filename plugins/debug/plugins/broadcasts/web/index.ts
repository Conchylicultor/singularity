import type { PluginDefinition } from "@core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { Debug } from "@plugins/debug/web";
import { MdAnnouncement } from "react-icons/md";
import { broadcastsPane } from "./panes";

export { broadcastsPane } from "./panes";

export default {
  id: "debug-broadcasts",
  name: "Broadcasts",
  description: "View and edit cli/broadcasts.json broadcast messages for stale worktrees.",
  contributions: [
    Pane.Register({ pane: broadcastsPane }),
    Debug.Item({
      id: "broadcasts",
      title: "Broadcasts",
      icon: MdAnnouncement,
      onClick: () => broadcastsPane.open({}),
    }),
  ],
} satisfies PluginDefinition;
