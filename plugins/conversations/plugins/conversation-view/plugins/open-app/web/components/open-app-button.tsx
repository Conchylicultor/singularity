import { MdRocketLaunch } from "react-icons/md";
import { PaneIconAction } from "@plugins/pane/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";

export function OpenAppButton() {
  const { conversation } = conversationPane.useData();
  return (
    <PaneIconAction
      label="Open app"
      icon={MdRocketLaunch}
      onClick={() =>
        window.open(
          `http://${conversation.attemptId}.localhost:9000/`,
          "_blank",
        )
      }
    />
  );
}
