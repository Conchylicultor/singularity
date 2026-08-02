import { PrepromptSelect } from "@plugins/conversations/plugins/preprompts/web";
import { toast } from "@plugins/shell/plugins/notifications/web";
import { useTaskPreprompt } from "../hooks";
import { setTaskPrepromptRemote } from "../internal/api";

/**
 * One select — so it rides the section header as `actions` rather than sitting
 * behind a chevron. The former body carried a caption restating the title
 * ("Append to the agent's system prompt on launch"); on one row the section's
 * own title says it, so the caption is gone rather than duplicated.
 */
export function TaskPrepromptControl({ taskId }: { taskId: string }) {
  const current = useTaskPreprompt(taskId);

  const handleChange = (id: string | null) => {
    setTaskPrepromptRemote(taskId, id).catch((err) => {
      toast({
        type: "task",
        title: "Failed to set preprompt",
        description: err instanceof Error ? err.message : String(err),
        variant: "error",
      });
    });
  };

  return (
    <PrepromptSelect
      value={current}
      onChange={handleChange}
      ariaLabel="Task preprompt"
    />
  );
}
