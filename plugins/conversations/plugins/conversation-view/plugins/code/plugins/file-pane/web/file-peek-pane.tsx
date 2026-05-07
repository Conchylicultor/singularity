import { useCallback, useEffect } from "react";
import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useEditedFiles } from "@plugins/conversations/plugins/conversation-view/plugins/code/web";
import { FilepathBreadcrumb } from "@plugins/primitives/plugins/filepath-breadcrumb/web";
import {
  useResolvedFile,
  FileDisambiguation,
} from "@plugins/code-explorer/plugins/file-resolve/web";
import { FileContent } from "./components/file-content";
import { FileTabs } from "./components/file-tabs";
import { useFileRenderers } from "./components/use-file-renderers";
import { FileOpenProvider } from "./file-open-context";

export const convFilePeekPane = Pane.define({
  id: "conv-file-peek",
  after: [conversationPane],
  segment: "file/:worktree/:filePath*",
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

  const resolved = useResolvedFile(worktree, filePath);

  useEffect(() => {
    if (resolved.status === "resolved") {
      const fp = resolved.path;
      convFilePeekPane.open({
        convId,
        worktree,
        filePath: line != null ? `${fp}:${line}` : fp,
      });
    }
  }, [resolved, convId, worktree, line]);

  const onFileOpen = useCallback(
    (fp: string, ln?: number) =>
      convFilePeekPane.open({ convId, worktree, filePath: ln != null ? `${fp}:${ln}` : fp }),
    [convId, worktree],
  );
  const { files } = useEditedFiles(convId);
  const status = files?.find((f) => f.path === filePath)?.status ?? "clean";
  const renderers = useFileRenderers({ path: filePath, status });

  if (resolved.status === "loading") {
    return (
      <PaneChrome
        pane={convFilePeekPane}
        title={<FilepathBreadcrumb path={filePath} />}
        hideRightActions
      >
        <div className="px-3 py-2 text-sm text-muted-foreground">
          Resolving…
        </div>
      </PaneChrome>
    );
  }

  if (resolved.status === "ambiguous") {
    return (
      <PaneChrome
        pane={convFilePeekPane}
        title={<FilepathBreadcrumb path={filePath} />}
        hideRightActions
      >
        <FileDisambiguation
          query={filePath}
          matches={resolved.matches}
          onSelect={(fp) =>
            convFilePeekPane.open({
              convId,
              worktree,
              filePath: line != null ? `${fp}:${line}` : fp,
            })
          }
        />
      </PaneChrome>
    );
  }

  const title = (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      <span className="min-w-0 flex-1 overflow-hidden">
        <FilepathBreadcrumb path={filePath} />
      </span>
      <FileTabs {...renderers} />
    </span>
  );

  return (
    <FileOpenProvider value={onFileOpen}>
      <PaneChrome pane={convFilePeekPane} title={title} hideRightActions>
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
