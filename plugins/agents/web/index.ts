import type { PluginDefinition } from "@core";
import { Shell } from "@plugins/shell/web";
import { MdPrecisionManufacturing } from "react-icons/md";
import { agentsRootPane } from "./panes";

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
    Shell.Sidebar({
      title: "Agents",
      icon: MdPrecisionManufacturing,
      group: "System",
      onClick: () => agentsRootPane.open({}),
    }),
  ],
} satisfies PluginDefinition;
