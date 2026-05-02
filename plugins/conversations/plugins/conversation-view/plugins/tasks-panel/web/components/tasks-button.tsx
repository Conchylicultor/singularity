import { MdChecklist } from "react-icons/md";
import { usePaneMatch } from "@plugins/primitives/plugins/pane/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { Button } from "@/components/ui/button";
import { useTask } from "@plugins/tasks/web";
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
  const match = usePaneMatch();
  const isOpen =
    match?.chain.some((e) => e.pane === convTasksPane._internal) ?? false;

  const task = useTask(conversation.taskId);
  const dotClass = task ? STATUS_DOT[task.status] : undefined;

  return (
    <Button
      variant={isOpen ? "secondary" : "ghost"}
      size="sm"
      title={task ? `Tasks · ${task.status.replace(/_/g, " ")}` : "Tasks"}
      aria-label="Tasks"
      aria-pressed={isOpen}
      onClick={() =>
        isOpen
          ? convTasksPane.close()
          : convTasksPane.open({ convId: conversation.id })
      }
      className="gap-1.5"
    >
      <MdChecklist className="size-4" />
      {dotClass && (
        <span className={`size-1.5 rounded-full ${dotClass}`} />
      )}
    </Button>
  );
}
