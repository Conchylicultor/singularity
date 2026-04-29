import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { CommitsGraphBody } from "./components/commits-graph-body";

export const convCommitsGraphPane = Pane.define({
  id: "conv-commits-graph",
  parent: conversationPane,
  path: "commits",
  component: ConvCommitsGraphBody,
});

function ConvCommitsGraphBody() {
  return (
    <PaneChrome pane={convCommitsGraphPane} title="Commits">
      <CommitsGraphBody />
    </PaneChrome>
  );
}
