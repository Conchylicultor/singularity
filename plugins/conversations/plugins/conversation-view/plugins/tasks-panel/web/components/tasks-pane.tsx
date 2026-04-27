import { useState } from "react";
import { MdClose, MdArrowUpward } from "react-icons/md";
import { Button } from "@/components/ui/button";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { TasksList, TaskDetail } from "@plugins/tasks/web";
import { tasksResource } from "@plugins/tasks/shared";
import { convTasksPane, convFilePeekPane } from "../panes";

export function TasksPane() {
  const { conversation } = conversationPane.useData();
  const convRootId = conversation.taskId;
  const [viewRootId, setViewRootId] = useState<string>(convRootId);
  const [selectedId, setSelectedId] = useState<string>(convRootId);

  const { data: tasks } = useResource(tasksResource);
  const viewRoot = tasks?.find((t) => t.id === viewRootId);
  const parentId = viewRoot?.parentId ?? null;

  const goToParent = parentId
    ? () => {
        setViewRootId(parentId);
        setSelectedId(parentId);
      }
    : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b px-2 py-1.5">
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          title="Close tasks"
          aria-label="Close tasks"
          onClick={() => convTasksPane.close()}
        >
          <MdClose className="size-4" />
        </Button>
        <div className="flex-1 text-sm font-medium">Tasks</div>
        {goToParent && (
          <Button
            variant="ghost"
            size="icon"
            className="size-7 shrink-0"
            title="Go to parent task"
            aria-label="Go to parent task"
            onClick={goToParent}
          >
            <MdArrowUpward className="size-4" />
          </Button>
        )}
      </div>
      <div className="max-h-[40%] min-h-0 shrink-0 overflow-auto border-b p-2">
        <TasksList
          rootTaskId={viewRootId}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <TaskDetail
          key={selectedId}
          taskId={selectedId}
          onFileOpen={(path) =>
            convFilePeekPane.open({ convId: conversation.id, filePath: path })
          }
        />
      </div>
    </div>
  );
}
