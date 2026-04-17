import { useState } from "react";
import { MdClose } from "react-icons/md";
import { Button } from "@/components/ui/button";
import type { ConversationState } from "@plugins/conversations/plugins/conversation-view/web/slots";
import { Conversation } from "@plugins/conversations/plugins/conversation-view/web/commands";
import { TasksList } from "@plugins/tasks/web/components/tasks-list";
import { TaskDetail } from "@plugins/tasks/web/components/task-detail";

export function TasksPane({
  conversation,
}: {
  conversation: ConversationState;
}) {
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
          onClick={() => Conversation.OpenRightPane(null)}
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
