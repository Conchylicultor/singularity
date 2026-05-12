import { MdOpenInFull } from "react-icons/md";
import { PaneIconAction, useOpenPane, usePaneMatch } from "@plugins/primitives/plugins/pane/web";
import { conversationPane } from "../panes";

export function ExpandConversationButton() {
  const { conversation } = conversationPane.useData();
  const match = usePaneMatch();
  const openPane = useOpenPane();
  const inOwnPane = match?.chain.some(
    (e) => e.pane === conversationPane._internal,
  );
  if (inOwnPane) return null;
  return (
    <PaneIconAction
      label="Expand"
      icon={MdOpenInFull}
      onClick={() => openPane(conversationPane, { convId: conversation.id }, { root: true })}
    />
  );
}
