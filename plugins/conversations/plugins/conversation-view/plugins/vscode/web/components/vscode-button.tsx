import { MdCode } from "react-icons/md";
import { PaneIconAction } from "@plugins/primitives/plugins/pane/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversationById } from "@plugins/conversations/web";

export function VscodeButton() {
  const { convId } = conversationPane.useParams();
  const conversation = useConversationById(convId);
  if (!conversation) return null;
  return (
    <PaneIconAction
      label="VSCode"
      icon={MdCode}
      onClick={() => {
        if (!conversation.worktreePath) return;
        window.open(
          `http://localhost:8110/?folder=${encodeURIComponent(conversation.worktreePath)}`,
          "_blank",
        );
      }}
    />
  );
}
