import type { PluginDefinition } from "@core";
import { MdRestore } from "react-icons/md";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { DebugApp } from "@plugins/apps/plugins/debug/plugins/shell/web";
import { recoveryPane } from "./pane";

export { recoveryPane } from "./pane";

export default {
  id: "conversations-recover",
  name: "Conversations Recover",
  description:
    "Sidebar entry + pane listing recently-closed conversations with restore buttons.",
  contributions: [
    Pane.Register({ pane: recoveryPane }),
    DebugApp.Sidebar({
      id: "conversations-recover",
      title: "Recovery",
      icon: MdRestore,
      onClick: () => recoveryPane.open({}),
    }),
  ],
} satisfies PluginDefinition;
