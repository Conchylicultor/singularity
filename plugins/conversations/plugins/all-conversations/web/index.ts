import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdForum } from "react-icons/md";
import { Pane, openPane } from "@plugins/primitives/plugins/pane/web";
import { sidebarNavItem } from "@plugins/primitives/plugins/app-shell/web";
import { Shell } from "@plugins/shell/web";
import { allConversationsPane } from "./panes";

export { allConversationsPane } from "./panes";
export { conversationFieldDefs } from "./internal/fields";

export default {
  description:
    "All-conversations app pane: a server-delegated DataView (filter/sort/search/keyset over every conversation) reachable from the agent-manager sidebar.",
  contributions: [
    Pane.Register({ pane: allConversationsPane }),
    Shell.Sidebar({
      id: "all-conversations",
      ...sidebarNavItem({
        title: "Conversation",
        icon: MdForum,
        onClick: () => openPane(allConversationsPane, {}, { mode: "root" }),
      }),
    }),
  ],
} satisfies PluginDefinition;
