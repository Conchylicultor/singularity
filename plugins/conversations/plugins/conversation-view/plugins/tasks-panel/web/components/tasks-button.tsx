import { MdChecklist } from "react-icons/md";
import type { ConversationState } from "@plugins/conversations/plugins/conversation-view/web/slots";
import {
  Conversation,
  useRightPane,
} from "@plugins/conversations/plugins/conversation-view/web/commands";
import { Button } from "@/components/ui/button";
import { tasksRightPane, TASKS_PANE_ID } from "../views";

export function TasksButton({
  conversation: _conversation,
}: {
  conversation: ConversationState;
}) {
  const current = useRightPane();
  const isOpen = current?.id === TASKS_PANE_ID;
  return (
    <Button
      variant={isOpen ? "secondary" : "ghost"}
      size="sm"
      title="Tasks"
      aria-label="Tasks"
      aria-pressed={isOpen}
      onClick={() =>
        Conversation.OpenRightPane(isOpen ? null : tasksRightPane())
      }
      className="gap-1.5"
    >
      <MdChecklist className="size-4" />
    </Button>
  );
}
