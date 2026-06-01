import { MdChecklist } from "react-icons/md";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversationById } from "@plugins/conversations/web";
import { Button } from "@/components/ui/button";
import { useTask } from "@plugins/tasks/web";
import { StatusDot } from "@plugins/primitives/plugins/status-dot/web";
import { convTasksPane } from "../panes";

const STATUS_DOT: Record<string, string> = {
  new: "bg-muted-foreground/40",
  in_progress: "bg-info",
  need_action: "bg-warning",
  attempted: "bg-muted-foreground",
  done: "bg-success",
  held: "bg-warning",
  dropped: "bg-muted-foreground/30",
  blocked: "bg-muted-foreground",
};

export function TasksButton() {
  const { convId } = conversationPane.useParams();
  const conversation = useConversationById(convId);
  const { isOpen, toggle } = convTasksPane.useToggle({ convId }, { input: { convId } });

  const task = useTask(conversation?.taskId ?? null);
  const dotClass = task ? STATUS_DOT[task.status] : undefined;

  return (
    <Button
      variant={isOpen ? "secondary" : "ghost"}
      size="sm"
      title={task ? `Tasks · ${task.status.replace(/_/g, " ")}` : "Tasks"}
      aria-label="Tasks"
      aria-pressed={isOpen}
      onClick={toggle}
      className="gap-1.5"
    >
      <MdChecklist className="size-4" />
      {dotClass && <StatusDot colorClass={dotClass} />}
    </Button>
  );
}
