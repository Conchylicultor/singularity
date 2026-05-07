import { useCallback, useEffect } from "react";
import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { FilepathBreadcrumb } from "@plugins/primitives/plugins/filepath-breadcrumb/web";
import {
  FileContent,
  FileOpenProvider,
  FileTabs,
  useFileRenderers,
} from "@plugins/conversations/plugins/conversation-view/plugins/code/plugins/file-pane/web";
import { taskDetailPane } from "@plugins/tasks/plugins/task-detail/web";
import {
  useResolvedFile,
  FileDisambiguation,
} from "@plugins/code-explorer/plugins/file-resolve/web";

export const taskFilePeekPane = Pane.define({
  id: "task-file-peek",
  after: [taskDetailPane],
  segment: "file/:filePath*",
  component: TaskFilePeekBody,
  chrome: { history: false },
  width: 600,
});

function TaskFilePeekBody() {
  const { taskId } = taskDetailPane.useParams();
  const { filePath } = taskFilePeekPane.useParams();
  const resolved = useResolvedFile("main", filePath);

  useEffect(() => {
    if (resolved.status === "resolved") {
      taskFilePeekPane.open({ taskId, filePath: resolved.path });
    }
  }, [resolved, taskId]);

  const onFileOpen = useCallback(
    (fp: string) => taskFilePeekPane.open({ taskId, filePath: fp }),
    [taskId],
  );
  const renderers = useFileRenderers({ path: filePath, status: "clean" });

  if (resolved.status === "loading") {
    return (
      <PaneChrome
        pane={taskFilePeekPane}
        title={<FilepathBreadcrumb path={filePath} />}
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
        pane={taskFilePeekPane}
        title={<FilepathBreadcrumb path={filePath} />}
      >
        <FileDisambiguation
          query={filePath}
          matches={resolved.matches}
          onSelect={(fp) => taskFilePeekPane.open({ taskId, filePath: fp })}
        />
      </PaneChrome>
    );
  }

  return (
    <FileOpenProvider value={onFileOpen}>
      <PaneChrome
        pane={taskFilePeekPane}
        title={<FilepathBreadcrumb path={filePath} />}
        actions={<FileTabs {...renderers} />}
      >
        <div className="h-full min-h-0 overflow-auto">
          <FileContent
            worktree="main"
            path={filePath}
            active={renderers.active}
          />
        </div>
      </PaneChrome>
    </FileOpenProvider>
  );
}
