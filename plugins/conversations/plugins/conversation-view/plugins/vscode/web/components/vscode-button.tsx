import { MdCode } from "react-icons/md";
import { PaneIconAction } from "@plugins/primitives/plugins/pane/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";

export function VscodeButton() {
  const { conversation } = conversationPane.useData();
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
