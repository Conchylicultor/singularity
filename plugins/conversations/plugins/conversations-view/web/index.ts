import type { PluginDefinition } from "@core";
import { Core } from "@core";
import { Shell } from "@plugins/shell/web";
import { MdForum } from "react-icons/md";
import { ConversationList } from "./components/conversation-list";
import { ConvCountLabel } from "./components/conv-count-label";
import { ForkErrorWatcher } from "./components/fork-error-watcher";

export default {
  id: "conversations",
  name: "Conversations",
  description: "Sidebar list of all conversations.",
  contributions: [
    Shell.Sidebar({
      title: "Conversations",
      icon: MdForum,
      component: ConversationList,
      labelExtra: ConvCountLabel,
      scroll: true,
    }),
    Core.Root({ component: ForkErrorWatcher }),
  ],
} satisfies PluginDefinition;
