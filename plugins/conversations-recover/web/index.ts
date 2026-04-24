import type { PluginDefinition } from "@core";
import { MdRestore } from "react-icons/md";
import { Shell } from "@plugins/shell/web";
import { recoveryPane } from "./pane";

export { recoveryPane } from "./pane";

export default {
  id: "conversations-recover",
  name: "Conversations Recover",
  description:
    "Sidebar entry + pane listing recently-closed conversations with restore buttons.",
  contributions: [
    Shell.Sidebar({
      title: "Recovery",
      icon: MdRestore,
      group: "System",
      onClick: () => recoveryPane.open({}),
    }),
  ],
} satisfies PluginDefinition;
