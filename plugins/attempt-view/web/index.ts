import type { PluginDefinition } from "@core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { Conversation } from "@plugins/conversations/plugins/conversation-view/plugins/action-bar/web";
import { AttemptSwitchButton } from "./components/attempt-switch-button";
import { attemptPane, attemptConversationPane } from "./panes";

export { attemptPane, attemptConversationPane } from "./panes";

export default {
  id: "attempt-view",
  name: "Attempt View",
  description:
    "Main pane at /a/:id showing an attempt's conversations on the left and the selected conversation on the right. Adds a toolbar button to the conversation view to switch into it.",
  contributions: [
    Pane.Register({ pane: attemptPane }),
    Pane.Register({ pane: attemptConversationPane }),
    Conversation.ActionBar({ id: "attempt-switch", component: AttemptSwitchButton }),
  ],
} satisfies PluginDefinition;
