import type { PluginDefinition } from "@core";
import { Core } from "@core";
import { Shell } from "@plugins/shell/web";
import { MdForum } from "react-icons/md";
import { ConversationList } from "./components/conversation-list";
import { ConvCountLabel } from "./components/conv-count-label";
import { ForkErrorWatcher } from "./components/fork-error-watcher";
import { AutoLaunchWatcher } from "./components/auto-launch-watcher";

export { ConversationsView } from "./slots";
export type { ViewContribution, ViewProps } from "./slots";

export default {
  id: "conversations",
  name: "Conversations",
  description: "Sidebar list of all conversations.",
  contributions: [
    Shell.Sidebar({
      id: "conversations",
      title: "Conversations",
      icon: MdForum,
      component: ConversationList,
      labelExtra: ConvCountLabel,
      scroll: true,
    }),
    Core.Root({ component: ForkErrorWatcher }),
    Core.Root({ component: AutoLaunchWatcher }),
  ],
} satisfies PluginDefinition;
