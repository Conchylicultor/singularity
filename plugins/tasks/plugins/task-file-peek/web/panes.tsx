import { useCallback } from "react";
import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import {
  FileContent,
  FileOpenProvider,
  FilePathLabel,
  FileTabs,
  useFileRenderers,
} from "@plugins/conversations/plugins/conversation-view/plugins/code/plugins/file-pane/web";
import { taskDetailPane } from "@plugins/tasks/plugins/task-detail/web";

export const taskFilePeekPane = Pane.define({
  id: "task-file-peek",
  parent: taskDetailPane,
  path: "file/:filePath*",
  component: TaskFilePeekBody,
  chrome: { history: false },
  width: 600,
});

function TaskFilePeekBody() {
  const { taskId } = taskDetailPane.useParams();
  const { filePath } = taskFilePeekPane.useParams();
  const onFileOpen = useCallback(
    (fp: string) => taskFilePeekPane.open({ taskId, filePath: fp }),
    [taskId],
  );
  const renderers = useFileRenderers({ path: filePath, status: "clean" });
  return (
    <FileOpenProvider value={onFileOpen}>
      <PaneChrome
        pane={taskFilePeekPane}
        title={<FilePathLabel path={filePath} />}
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
