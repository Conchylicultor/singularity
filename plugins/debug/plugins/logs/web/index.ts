import type { PluginDefinition } from "@core";
import { Debug } from "@plugins/debug/web";
import { MdTerminal } from "react-icons/md";
import { logsPane } from "./panes";

export { logsPane, logChannelPane } from "./panes";

export default {
  id: "logs",
  name: "Logs",
  description: "System logs pane, opened from the Debug sidebar.",
  contributions: [
    Debug.Item({
      id: "logs",
      title: "Logs",
      icon: MdTerminal,
      onClick: () => logsPane.open({}),
    }),
  ],
} satisfies PluginDefinition;
