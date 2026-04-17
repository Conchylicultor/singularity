import type { PluginDefinition } from "@core";
import { Core } from "@core";
import { Shell } from "@plugins/shell/web/slots";
import { MdForum } from "react-icons/md";
import { ConversationList } from "./components/conversation-list";
import { ForkErrorWatcher } from "./components/fork-error-watcher";

const conversationsPlugin: PluginDefinition = {
  id: "conversations",
  name: "Conversations",
  description: "Sidebar list of all conversations.",
  contributions: [
    Shell.Sidebar({
      title: "Conversations",
      icon: MdForum,
      component: ConversationList,
    }),
    Core.Root({ component: ForkErrorWatcher }),
  ],
};

export default conversationsPlugin;
