import { useCallback } from "react";
import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { FilePaneView } from "./components/file-pane";
import { FileOpenProvider } from "./file-open-context";

export const convFilePeekPane = Pane.define({
  id: "conv-file-peek",
  parent: conversationPane,
  path: "file/:worktree/:filePath*",
  component: ConvFilePeekPaneBody,
  chrome: { history: false },
});

function ConvFilePeekPaneBody() {
  const { convId } = conversationPane.useParams();
  const { worktree, filePath } = convFilePeekPane.useParams();
  const onFileOpen = useCallback(
    (fp: string) => convFilePeekPane.open({ convId, worktree, filePath: fp }),
    [convId, worktree],
  );
  return (
    <FileOpenProvider value={onFileOpen}>
      <PaneChrome pane={convFilePeekPane} title={filePath}>
        <FilePaneView worktree={worktree} path={filePath} status="clean" />
      </PaneChrome>
    </FileOpenProvider>
  );
}
