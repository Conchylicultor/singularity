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
  width: 600,
});

function ConvFilePeekPaneBody() {
  const { convId } = conversationPane.useParams();
  const { worktree, filePath: rawFilePath } = convFilePeekPane.useParams();

  const lineMatch = rawFilePath.match(/:(\d+)$/);
  const line = lineMatch ? parseInt(lineMatch[1]!, 10) : undefined;
  const filePath = lineMatch ? rawFilePath.slice(0, -lineMatch[0]!.length) : rawFilePath;

  const onFileOpen = useCallback(
    (fp: string, ln?: number) =>
      convFilePeekPane.open({ convId, worktree, filePath: ln != null ? `${fp}:${ln}` : fp }),
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
            line={line}
            active={renderers.active}
          />
        </div>
      </PaneChrome>
    </FileOpenProvider>
  );
}
