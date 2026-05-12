import type { PluginDefinition } from "@core";
import { MdPublish } from "react-icons/md";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { Forge } from "@plugins/apps/plugins/forge/plugins/shell/web";
import { publishPane } from "./panes";

export default {
  id: "forge-publish",
  name: "Forge: Publish",
  description:
    "Sidebar entry and filterable tree pane for pre-publish plugin review.",
  contributions: [
    Pane.Register({ pane: publishPane }),
    Forge.Sidebar({
      id: "publish",
      title: "Publish",
      icon: MdPublish,
      group: "Plugins",
      onClick: () => publishPane.open({}),
    }),
  ],
} satisfies PluginDefinition;
