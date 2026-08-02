import { EffortSelect } from "@plugins/conversations/plugins/effort-provider/web";
import { toast } from "@plugins/shell/plugins/notifications/web";
import type { EffortLevel } from "@plugins/conversations/plugins/effort-provider/core";
import { useTaskEffort } from "../hooks";
import { setTaskEffortRemote } from "../internal/api";

/**
 * One select — so it rides the section header as `actions` rather than sitting
 * behind a chevron. The former body carried a caption restating the title
 * ("Claude Code effort level applied when an agent launches"); on one row the
 * section's own title says it, so the caption is gone rather than duplicated.
 */
export function TaskEffortControl({ taskId }: { taskId: string }) {
  const current = useTaskEffort(taskId);

  const handleChange = (level: EffortLevel | null) => {
    setTaskEffortRemote(taskId, level).catch((err) => {
      toast({
        type: "task",
        title: "Failed to set thinking mode",
        description: err instanceof Error ? err.message : String(err),
        variant: "error",
      });
    });
  };

  return (
    <EffortSelect
      value={current}
      onChange={handleChange}
      ariaLabel="Task thinking mode"
    />
  );
}
