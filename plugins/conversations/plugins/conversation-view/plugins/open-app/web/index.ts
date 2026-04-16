import type { PluginDefinition } from "@core";
import { Conversation } from "@plugins/conversations/plugins/conversation-view/web/slots";
import { MdRocketLaunch } from "react-icons/md";

const openAppPlugin: PluginDefinition = {
  id: "conversation-open-app",
  name: "Conversation: Open App",
  description:
    "Opens the conversation's namespace at `http://<id>.localhost:9000/`.",
  contributions: [
    Conversation.Toolbar({
      label: "Open",
      icon: MdRocketLaunch,
      onClick: (conversation) => {
        window.open(
          `http://${conversation.attemptId}.localhost:9000/`,
          "_blank",
        );
      },
    }),
  ],
};

export default openAppPlugin;
