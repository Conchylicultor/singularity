import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Shell } from "@plugins/shell/web";
import { MdForum } from "react-icons/md";
import { ConversationsSidebar } from "./components/conversations-sidebar";

export { ConversationsView } from "./slots";
export type { ViewProps } from "./slots";
export { useGoneConversationsPagination } from "./internal/use-gone-conversations-pagination";

export default {
  description: "Sidebar list of all conversations.",
  contributions: [
    Shell.Sidebar({
      id: "conversations",
      title: "Conversations",
      icon: MdForum,
      component: ConversationsSidebar,
      // This section fills the sidebar column and scrolls internally; keep that
      // bound in reorder edit mode so it doesn't overflow onto sibling sections.
      reorderFill: true,
    }),
  ],
} satisfies PluginDefinition;
