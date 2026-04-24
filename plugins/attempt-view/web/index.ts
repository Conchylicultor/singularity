import type { PluginDefinition } from "@core";
import { Conversation } from "@plugins/conversations/plugins/conversation-view/web";
import { AttemptSwitchButton } from "./components/attempt-switch-button";

import "./panes";

export { attemptPane, attemptConversationPane } from "./panes";

export default {
  id: "attempt-view",
  name: "Attempt View",
  description:
    "Main pane at /a/:id showing an attempt's conversations on the left and the selected conversation on the right. Adds a toolbar button to the conversation view to switch into it.",
  contributions: [Conversation.Toolbar({ component: AttemptSwitchButton })],
} satisfies PluginDefinition;
