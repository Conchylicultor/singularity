import type { PluginDefinition } from "@core";
import { Conversation } from "@plugins/conversations/plugins/conversation-view/web";
import { PushAndExitButton } from "./components/push-and-exit-button";

export default {
  id: "conversation-push-and-exit",
  name: "Conversation: Push & Exit",
  description:
    "Toolbar button that asks Claude to push the branch and close the conversation; surfaces Claude's flag if it has anything to raise.",
  contributions: [Conversation.Toolbar({ component: PushAndExitButton })],
} satisfies PluginDefinition;
