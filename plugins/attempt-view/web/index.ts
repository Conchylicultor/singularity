import type { PluginDefinition } from "@core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
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
    conversationPane.Actions({ component: AttemptSwitchButton }),
  ],
} satisfies PluginDefinition;
