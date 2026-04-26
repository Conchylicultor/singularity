import type { PluginDefinition } from "@core";
import { Shell } from "@plugins/shell/web";
import { MdAccountTree } from "react-icons/md";
import { yakShavingPane } from "./panes";

export { yakShavingPane, yakShavingConversationPane } from "./panes";

export default {
  id: "yak-shaving",
  name: "Yak Shaving",
  description:
    "Persisted tree of conversations annotated with one-line context, status, and next-action. Curated by a Sonnet model.",
  contributions: [
    Shell.Sidebar({
      title: "Yak",
      icon: MdAccountTree,
      group: "System",
      onClick: () => yakShavingPane.open({}),
    }),
  ],
} satisfies PluginDefinition;
