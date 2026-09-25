import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdForum } from "react-icons/md";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { Shell } from "@plugins/shell/web";
import { opensPane } from "@plugins/primitives/plugins/app-shell/web";
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
      title: "Conversation",
      icon: MdForum,
      opens: opensPane(allConversationsPane, {}),
    }),
  ],
  slots: { "all-conversations": allConversationsPane },
} satisfies PluginDefinition;
