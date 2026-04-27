import type { PluginDefinition } from "@core";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { AttemptSwitchButton } from "./components/attempt-switch-button";

import "./panes";

export { attemptPane, attemptConversationPane } from "./panes";

export default {
  id: "attempt-view",
  name: "Attempt View",
  description:
    "Main pane at /a/:id showing an attempt's conversations on the left and the selected conversation on the right. Adds a toolbar button to the conversation view to switch into it.",
  contributions: [conversationPane.Actions({ component: AttemptSwitchButton })],
} satisfies PluginDefinition;
