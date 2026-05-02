import type { PluginDefinition } from "@core";
import { Conversation } from "@plugins/conversations/plugins/conversation-view/plugins/action-bar/web";
import { OpenAppButton } from "./components/open-app-button";

export default {
  id: "conversation-open-app",
  name: "Conversation: Open App",
  description:
    "Opens the conversation's namespace at `http://<id>.localhost:9000/`.",
  contributions: [Conversation.ActionBar({ id: "open-app", component: OpenAppButton })],
} satisfies PluginDefinition;
