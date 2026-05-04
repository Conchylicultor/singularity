import { MdDelete } from "react-icons/md";
import { cn } from "@/lib/utils";

export function DeleteAgentAction({
  agentId,
  hasChildren,
}: {
  agentId: string;
  hasChildren: boolean;
}) {
  const disabled = hasChildren;
  const title = disabled
    ? "Delete (only leaf agents can be deleted)"
    : "Delete agent";

  const onClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled) return;
    await fetch(`/api/agents/${agentId}`, { method: "DELETE" });
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label="Delete agent"
      className={cn(
        "hover:bg-background/60 flex size-6 shrink-0 items-center justify-center rounded",
        disabled && "cursor-not-allowed opacity-30 hover:bg-transparent",
      )}
    >
      <MdDelete className="size-4" />
    </button>
  );
}
