import { useState } from "react";
import { MdClose } from "react-icons/md";
import { Button } from "@/components/ui/button";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { TasksList } from "@plugins/tasks/web";
import { TaskDetail } from "@plugins/tasks/web";
import { convTasksPane } from "../panes";

export function TasksPane() {
  const { conversation } = conversationPane.useData();
  const rootId = conversation.taskId;
  const [selectedId, setSelectedId] = useState<string>(rootId);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b px-2 py-1.5">
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
        <div className="text-sm font-medium">Tasks</div>
      </div>
      <div className="max-h-[40%] min-h-0 shrink-0 overflow-auto border-b p-2">
        <TasksList
          rootTaskId={rootId}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <TaskDetail key={selectedId} taskId={selectedId} />
      </div>
    </div>
  );
}
