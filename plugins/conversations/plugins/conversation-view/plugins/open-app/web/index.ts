import type { PluginDefinition } from "@core";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { OpenAppButton } from "./components/open-app-button";

export default {
  id: "conversation-open-app",
  name: "Conversation: Open App",
  description:
    "Opens the conversation's namespace at `http://<id>.localhost:9000/`.",
  contributions: [conversationPane.Actions({ component: OpenAppButton })],
} satisfies PluginDefinition;
