import type { PluginDefinition } from "@core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { Shell } from "@plugins/shell/web";
import { MdPrecisionManufacturing } from "react-icons/md";
import {
  agentsRootPane,
  agentDetailPane,
  agentConversationPane,
} from "./panes";

export {
  agentsRootPane,
  agentDetailPane,
  agentConversationPane,
} from "./panes";

export default {
  id: "agents",
  name: "Agents",
  description: "Named agent definitions that launch conversations.",
  contributions: [
    Pane.Register({ pane: agentsRootPane }),
    Pane.Register({ pane: agentDetailPane }),
    Pane.Register({ pane: agentConversationPane }),
    Shell.Sidebar({
      title: "Agents",
      icon: MdPrecisionManufacturing,
      group: "System",
      onClick: () => agentsRootPane.open({}),
    }),
  ],
} satisfies PluginDefinition;
