import { MdDelete } from "react-icons/md";
import { patchTask } from "@plugins/tasks/web";
import { cn } from "@/lib/utils";

// "Delete" is a soft drop: it marks the task dropped (reversible via the
// task header's Undrop), never removing the row. Tasks are never hard-deleted.
export function DeleteTaskAction({
  taskId,
  hasChildren,
}: {
  taskId: string;
  hasChildren: boolean;
}) {
  const disabled = hasChildren;
  const title = disabled
    ? "Drop (only leaf tasks can be dropped here)"
    : "Drop task";

  const onClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled) return;
    await patchTask(taskId, { drop: true });
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label="Drop task"
      className={cn(
        "hover:bg-background/60 flex size-6 shrink-0 items-center justify-center rounded",
        disabled && "cursor-not-allowed opacity-30 hover:bg-transparent",
      )}
    >
      <MdDelete className="size-4" />
    </button>
  );
}
