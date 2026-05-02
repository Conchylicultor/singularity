import type { PluginDefinition } from "@core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { Conversation } from "@plugins/conversations/plugins/conversation-view/plugins/action-bar/web";
import { TerminalButton } from "./components/terminal-button";
import { convTerminalPane } from "./panes";

export default {
  id: "conversation-terminal-pane",
  name: "Conversation: Terminal pane",
  description:
    "Toolbar button that opens a right pane attaching to the conversation's tmux session.",
  contributions: [
    Pane.Register({ pane: convTerminalPane }),
    Conversation.ActionBar({ id: "terminal", component: TerminalButton }),
  ],
} satisfies PluginDefinition;
