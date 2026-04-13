import type { PluginDefinition } from "@core";
import { Shell } from "@plugins/shell/web/slots";
import { MdForum } from "react-icons/md";
import { ConversationList } from "./components/conversation-list";

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
  ],
};

export default conversationsPlugin;
