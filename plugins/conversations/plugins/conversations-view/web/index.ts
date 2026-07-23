import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Shell } from "@plugins/shell/web";
import { MdAdd, MdForum } from "react-icons/md";
import { ConversationsSidebar } from "./components/conversations-sidebar";
import { LaunchSidebarItem } from "./components/launch-sidebar-item";

export default {
  description: "Sidebar list of all conversations.",
  contributions: [
    // The new-conversation launch control, sized and inset like the nav links
    // so it sits in the nav block at the top of the sidebar.
    Shell.Sidebar({
      id: "launch",
      title: "New conversation",
      icon: MdAdd,
      component: LaunchSidebarItem,
    }),
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
