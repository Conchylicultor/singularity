import { MdDelete } from "react-icons/md";
import { cn } from "@/lib/utils";

export function DeleteTaskAction({
  taskId,
  hasChildren,
}: {
  taskId: string;
  hasChildren: boolean;
}) {
  const disabled = hasChildren;
  const title = disabled
    ? "Delete (only leaf tasks can be deleted)"
    : "Delete task";

  const onClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled) return;
    await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label="Delete task"
      className={cn(
        "hover:bg-background/60 flex size-6 shrink-0 items-center justify-center rounded",
        disabled && "cursor-not-allowed opacity-30 hover:bg-transparent",
      )}
    >
      <MdDelete className="size-4" />
    </button>
  );
}
