import type { PluginDefinition } from "@core";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { VscodeButton } from "./components/vscode-button";

export default {
  id: "conversation-vscode",
  name: "Conversation: VSCode",
  description: "Opens the conversation's worktree in VSCode.",
  contributions: [conversationPane.Actions({ component: VscodeButton })],
} satisfies PluginDefinition;
