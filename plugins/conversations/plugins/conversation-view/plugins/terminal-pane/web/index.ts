import type { PluginDefinition } from "@core";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { TerminalButton } from "./components/terminal-button";

// Importing panes registers `convTerminalPane` with the Pane registry.
import "./panes";

export default {
  id: "conversation-terminal-pane",
  name: "Conversation: Terminal pane",
  description:
    "Toolbar button that opens a right pane attaching to the conversation's tmux session.",
  contributions: [conversationPane.Actions({ component: TerminalButton })],
} satisfies PluginDefinition;
