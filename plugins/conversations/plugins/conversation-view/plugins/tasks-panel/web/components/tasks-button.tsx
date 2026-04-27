import { MdChecklist } from "react-icons/md";
import { usePaneMatch } from "@plugins/pane/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { Button } from "@/components/ui/button";
import { convTasksPane } from "../panes";

export function TasksButton() {
  const { conversation } = conversationPane.useData();
  const match = usePaneMatch();
  const isOpen =
    match?.chain.some((e) => e.pane === convTasksPane._internal) ?? false;
  return (
    <Button
      variant={isOpen ? "secondary" : "ghost"}
      size="sm"
      title="Tasks"
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
    </Button>
  );
}
