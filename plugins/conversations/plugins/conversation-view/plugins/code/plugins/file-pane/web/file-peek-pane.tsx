import { useEffect } from "react";
import { Pane, PaneChrome, useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useEditedFiles } from "@plugins/conversations/plugins/conversation-view/plugins/code/web";
import { taskDetailPane } from "@plugins/tasks/plugins/task-detail/web";
import { FilepathBreadcrumb } from "@plugins/primitives/plugins/filepath-breadcrumb/web";
import {
  useResolvedFile,
  FileDisambiguation,
} from "@plugins/code-explorer/plugins/file-resolve/web";
import { FileContent } from "./components/file-content";
import { FileTabs } from "./components/file-tabs";
import { useFileRenderers } from "./components/use-file-renderers";

export const filePeekPane = Pane.define({
  id: "file-peek",
  after: [conversationPane, taskDetailPane],
  segment: "file/:worktree/:filePath*",
  component: FilePeekPaneBody,
  chrome: { history: false },
  width: 600,
});

function FilePeekPaneBody() {
  const openPane = useOpenPane();
  const convId = conversationPane.useChainEntry()?.params.convId;

  const { worktree, filePath: rawFilePath } = filePeekPane.useParams();

  const lineMatch = rawFilePath.match(/:(\d+)$/);
  const line = lineMatch ? parseInt(lineMatch[1]!, 10) : undefined;
  const filePath = lineMatch ? rawFilePath.slice(0, -lineMatch[0]!.length) : rawFilePath;

  const resolved = useResolvedFile(worktree, filePath);

  useEffect(() => {
    if (resolved.status === "resolved") {
      const fp = resolved.path;
      openPane(filePeekPane, {
        worktree,
        filePath: line != null ? `${fp}:${line}` : fp,
      }, { mode: "swap" });
    }
  }, [resolved, worktree, line, openPane]);

  const { files } = useEditedFiles(convId ?? "");
  const status = files.find((f) => f.path === filePath)?.status ?? "clean";
  const renderers = useFileRenderers({ path: filePath, status });

  if (resolved.status === "loading") {
    return (
      <PaneChrome
        pane={filePeekPane}
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
        pane={filePeekPane}
        title={<FilepathBreadcrumb path={filePath} />}
        hideRightActions
      >
        <FileDisambiguation
          query={filePath}
          matches={resolved.matches}
          onSelect={(fp) =>
            openPane(filePeekPane, {
              worktree,
              filePath: line != null ? `${fp}:${line}` : fp,
            }, { mode: "swap" })
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
    <PaneChrome pane={filePeekPane} title={title} hideRightActions>
      <div className="h-full min-h-0 overflow-auto">
        <FileContent
          worktree={worktree}
          path={filePath}
          line={line}
          active={renderers.active}
        />
      </div>
    </PaneChrome>
  );
}
