import type { PluginDefinition } from "@core";
import { MdPublish } from "react-icons/md";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { Shell } from "@plugins/shell/web";
import { publishPane } from "./panes";

export { publishPane } from "./panes";

export default {
  id: "publish",
  name: "Publish",
  description:
    "Review the worktree's plugin tree before publishing to the marketplace.",
  contributions: [
    Pane.Register({ pane: publishPane }),
    Shell.Sidebar({
      id: "publish",
      title: "Publish",
      icon: MdPublish,
      group: "System",
      onClick: () => publishPane.open({}),
    }),
  ],
} satisfies PluginDefinition;
