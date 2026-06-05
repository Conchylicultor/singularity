import { PrepromptSelect } from "@plugins/conversations/plugins/preprompts/web";
import { toast } from "@plugins/notifications/web";
import { useTaskPreprompt } from "../hooks";
import { setTaskPrepromptRemote } from "../internal/api";

export function TaskPrepromptSection({ taskId }: { taskId: string }) {
  const current = useTaskPreprompt(taskId);

  const handleChange = (id: string | null) => {
    setTaskPrepromptRemote(taskId, id).catch((err) => {
      toast({
        type: "task",
        description: `Failed to set preprompt: ${err instanceof Error ? err.message : String(err)}`,
        variant: "error",
      });
    });
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Append to the agent's system prompt on launch</span>
        <PrepromptSelect value={current} onChange={handleChange} ariaLabel="Task preprompt" />
      </div>
    </div>
  );
}
