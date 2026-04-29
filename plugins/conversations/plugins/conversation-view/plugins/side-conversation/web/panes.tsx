import { Pane } from "@plugins/primitives/plugins/pane/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { SideConversationBody } from "./components/side-conversation-body";

export const convSidePane = Pane.define({
  id: "conv-side",
  parent: conversationPane,
  path: "c/:sideConvId",
  component: SideConversationBody,
  chrome: {
    history: false,
    expand: ({ sideConvId }) => `/c/${sideConvId}`,
  },
});
