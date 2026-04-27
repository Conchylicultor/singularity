import { MdOpenInFull } from "react-icons/md";
import { PaneIconAction, usePaneMatch } from "@plugins/pane/web";
import { conversationPane } from "../panes";

/**
 * Pops the conversation out of an embedding split (Tasks or Agents) into
 * the standalone /c/:convId view. Hidden when the user is already at
 * /c/:convId — there's nothing to expand into.
 */
export function ExpandConversationButton() {
  const { conversation } = conversationPane.useData();
  const match = usePaneMatch();
  const inOwnPane = match?.chain.some(
    (e) => e.pane === conversationPane._internal,
  );
  if (inOwnPane) return null;
  return (
    <PaneIconAction
      label="Expand"
      icon={MdOpenInFull}
      onClick={() => conversationPane.open({ convId: conversation.id })}
    />
  );
}
