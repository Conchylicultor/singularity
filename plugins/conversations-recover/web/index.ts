import type { PluginDefinition } from "@core";
import { MdRestore } from "react-icons/md";
import { Debug } from "@plugins/debug/web";
import { recoveryPane } from "./pane";

export { recoveryPane } from "./pane";

export default {
  id: "conversations-recover",
  name: "Conversations Recover",
  description:
    "Sidebar entry + pane listing recently-closed conversations with restore buttons.",
  contributions: [
    Debug.Item({
      id: "conversations-recover",
      title: "Recovery",
      icon: MdRestore,
      onClick: () => recoveryPane.open({}),
    }),
  ],
} satisfies PluginDefinition;
