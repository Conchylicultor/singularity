import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Core } from "@plugins/framework/plugins/web-sdk/core";
import { Shell } from "@plugins/shell/web";
import { MdForum } from "react-icons/md";
import { ConversationsSidebar } from "./components/conversations-sidebar";
import { ForkErrorWatcher } from "./components/fork-error-watcher";
import { AutoLaunchWatcher } from "./components/auto-launch-watcher";

export { ConversationsView } from "./slots";
export type { ViewProps } from "./slots";
export { useGoneConversationsPagination } from "./internal/use-gone-conversations-pagination";

export default {
  id: "conversations",
  name: "Conversations",
  description: "Sidebar list of all conversations.",
  contributions: [
    Shell.Sidebar({
      id: "conversations",
      title: "Conversations",
      icon: MdForum,
      component: ConversationsSidebar,
      reorderWrapperClassName: "flex flex-col flex-1 min-h-0",
    }),
    Core.Root({ component: ForkErrorWatcher }),
    Core.Root({ component: AutoLaunchWatcher }),
  ],
} satisfies PluginDefinition;
