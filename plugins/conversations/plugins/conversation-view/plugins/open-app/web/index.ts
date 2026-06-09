import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Conversation } from "@plugins/conversations/plugins/conversation-view/plugins/action-bar/web";
import { OpenAppButton } from "./components/open-app-button";

export default {
  description:
    "Opens the conversation's namespace at `http://<id>.localhost:9000/`.",
  contributions: [Conversation.ActionBar({ id: "open-app", component: OpenAppButton })],
} satisfies PluginDefinition;
