import { MdRocketLaunch } from "react-icons/md";
import { PaneIconAction } from "@plugins/primitives/plugins/pane/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversationById } from "@plugins/conversations/web";

export function OpenAppButton() {
  const { convId } = conversationPane.useParams();
  const conversation = useConversationById(convId);
  if (!conversation) return null;
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
