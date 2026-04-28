import { useCallback } from "react";
import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { FileContent } from "./components/file-content";
import { FilePathLabel } from "./components/file-path-label";
import { FileTabs } from "./components/file-tabs";
import { useFileRenderers } from "./components/use-file-renderers";
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
  const renderers = useFileRenderers({ path: filePath, status: "clean" });
  return (
    <FileOpenProvider value={onFileOpen}>
      <PaneChrome
        pane={convFilePeekPane}
        title={<FilePathLabel path={filePath} />}
        actions={<FileTabs {...renderers} />}
      >
        <div className="h-full min-h-0 overflow-auto">
          <FileContent
            worktree={worktree}
            path={filePath}
            active={renderers.active}
          />
        </div>
      </PaneChrome>
    </FileOpenProvider>
  );
}
