import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { FilePaneView } from "./components/file-pane";

export const convFilePeekPane = Pane.define({
  id: "conv-file-peek",
  parent: conversationPane,
  path: "file/:worktree/:filePath*",
  component: ConvFilePeekPaneBody,
  chrome: { history: false },
});

function ConvFilePeekPaneBody() {
  const { worktree, filePath } = convFilePeekPane.useParams();
  return (
    <PaneChrome pane={convFilePeekPane} title={filePath}>
      <FilePaneView worktree={worktree} path={filePath} status="clean" />
    </PaneChrome>
  );
}
