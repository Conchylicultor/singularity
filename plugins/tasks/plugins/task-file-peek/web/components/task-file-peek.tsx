import { MdClose } from "react-icons/md";
import { Button } from "@/components/ui/button";
import { FilePaneView } from "@plugins/conversations/plugins/conversation-view/plugins/code/plugins/file-pane/web";
import { useTaskDetailFilePeek } from "@plugins/tasks/plugins/task-detail/web";

export function TaskFilePeek(_: { taskId: string }) {
  const { filePath, closeFile } = useTaskDetailFilePeek();
  if (filePath === null) return null;
  return (
    <div className="flex h-full min-h-0 flex-col border-l">
      <div className="flex shrink-0 items-center gap-2 border-b px-2 py-1.5">
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          title="Close"
          aria-label="Close file preview"
          onClick={closeFile}
        >
          <MdClose className="size-4" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <FilePaneView worktree="main" path={filePath} status="clean" />
      </div>
    </div>
  );
}
