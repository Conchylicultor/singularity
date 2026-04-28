import type { PluginDefinition } from "@core";
import { MdRestore } from "react-icons/md";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { Debug } from "@plugins/debug/web";
import { recoveryPane } from "./pane";

export { recoveryPane } from "./pane";

export default {
  id: "conversations-recover",
  name: "Conversations Recover",
  description:
    "Sidebar entry + pane listing recently-closed conversations with restore buttons.",
  contributions: [
    Pane.Register({ pane: recoveryPane }),
    Debug.Item({
      id: "conversations-recover",
      title: "Recovery",
      icon: MdRestore,
      onClick: () => recoveryPane.open({}),
    }),
  ],
} satisfies PluginDefinition;
