import type { PluginDefinition } from "@core";
import { Conversation } from "@plugins/conversations/plugins/conversation-view/web/slots";
import { MdOpenInNew } from "react-icons/md";

const openAppPlugin: PluginDefinition = {
  id: "conversation-open-app",
  name: "Conversation: Open App",
  contributions: [
    Conversation.Toolbar({
      label: "Open",
      icon: MdOpenInNew,
      onClick: (conversation) => {
        window.open(
          `http://${conversation.id}.localhost:9000/`,
          "_blank",
        );
      },
    }),
  ],
};

export default openAppPlugin;
