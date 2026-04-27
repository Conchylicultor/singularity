import { Pane, PaneChrome } from "@plugins/pane/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { JsonlPane } from "./components/jsonl-pane";

export const convJsonlPane = Pane.define({
  id: "conv-jsonl",
  parent: conversationPane,
  path: "jsonl",
  component: ConvJsonlBody,
});

function ConvJsonlBody() {
  return (
    <PaneChrome pane={convJsonlPane} title="JSONL">
      <JsonlPane />
    </PaneChrome>
  );
}
