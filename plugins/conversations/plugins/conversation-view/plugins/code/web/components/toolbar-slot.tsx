import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { Code } from "../slots";

export function CodeToolbarSlot() {
  const { conversation } = conversationPane.useData();
  const items = Code.ToolbarButton.useContributions();
  return (
    <>
      {items.map((item, idx) => {
        const Component = item.component;
        return <Component key={idx} conversation={conversation} />;
      })}
    </>
  );
}
