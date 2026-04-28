import type { PluginDefinition } from "@core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { TerminalButton } from "./components/terminal-button";
import { convTerminalPane } from "./panes";

export default {
  id: "conversation-terminal-pane",
  name: "Conversation: Terminal pane",
  description:
    "Toolbar button that opens a right pane attaching to the conversation's tmux session.",
  contributions: [
    Pane.Register({ pane: convTerminalPane }),
    conversationPane.Actions({ component: TerminalButton }),
  ],
} satisfies PluginDefinition;
