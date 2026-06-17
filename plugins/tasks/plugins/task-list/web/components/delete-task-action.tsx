import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { WithTooltip } from "@plugins/primitives/plugins/tooltip/web";
import { MdDelete } from "react-icons/md";
import type { ItemActionProps } from "@plugins/primitives/plugins/data-view/web";
import type { TaskListItem } from "@plugins/tasks/core";
import { patchTask } from "@plugins/tasks/web";

// "Delete" is a soft drop: it marks the task dropped (reversible via the
// task header's Undrop), never removing the row. Tasks are never hard-deleted.
export function DeleteTaskAction({
  row,
  hasChildren,
}: ItemActionProps<TaskListItem>) {
  const taskId = row.id;
  const disabled = hasChildren;
  const title = disabled
    ? "Only leaf tasks can be dropped here — drop the children first"
    : "Drop task";

  const onClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled) return;
    await patchTask(taskId, { drop: true });
  };

  return (
    // aria-disabled (not the native `disabled` attribute) so the button still
    // receives hover events and the tooltip explaining *why* it's disabled can
    // appear; onClick early-returns when disabled.
    <WithTooltip content={title}>
      <button
        type="button"
        onClick={onClick}
        aria-disabled={disabled}
        aria-label="Drop task"
        className={cn(
          "hover:bg-background/60 flex size-6 shrink-0 items-center justify-center rounded-md",
          disabled &&
            "cursor-not-allowed opacity-30 hover:bg-transparent",
        )}
      >
        <MdDelete className="size-4" />
      </button>
    </WithTooltip>
  );
}
