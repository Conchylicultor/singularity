import type { PluginDefinition } from "@core";
import { Shell } from "@plugins/shell/web/slots";
import { MdSmartToy } from "react-icons/md";
import { ConversationList } from "./components/conversation-list";

const conversationsPlugin: PluginDefinition = {
  id: "conversations",
  name: "Conversations",
  contributions: [
    Shell.Sidebar({
      title: "Conversations",
      icon: MdSmartToy,
      component: ConversationList,
    }),
  ],
};

export default conversationsPlugin;
