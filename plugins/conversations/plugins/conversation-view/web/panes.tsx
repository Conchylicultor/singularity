import { Pane } from "@plugins/primitives/plugins/pane/web";
import { ConversationView } from "./components/conversation-view";

export const conversationPane = Pane.define({
  id: "conversation",
  segment: "c/:convId",
  component: ConversationView,
  width: 600,
});
