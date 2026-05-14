import { MdChecklist } from "react-icons/md";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { Button } from "@/components/ui/button";
import { useTask } from "@plugins/tasks/web";
import { StatusDot } from "@plugins/primitives/plugins/status-dot/web";
import { convTasksPane } from "../panes";

const STATUS_DOT: Record<string, string> = {
  new: "bg-muted-foreground/40",
  in_progress: "bg-blue-500",
  need_action: "bg-orange-500",
  attempted: "bg-muted-foreground",
  done: "bg-emerald-500",
  held: "bg-amber-500",
  dropped: "bg-muted-foreground/30",
  blocked: "bg-zinc-500",
};

export function TasksButton() {
  const { conversation } = conversationPane.useData();
  const { isOpen, toggle } = convTasksPane.useToggle({ convId: conversation.id });

  const task = useTask(conversation.taskId);
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
