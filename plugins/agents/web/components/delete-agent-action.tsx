import { MdDelete } from "react-icons/md";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { cn } from "@/lib/utils";
import { agentsResource } from "../../shared/resources";

export function DeleteAgentAction({ agentId }: { agentId: string }) {
  const { data } = useResource(agentsResource);
  const hasChildren = (data ?? []).some((a) => a.parentId === agentId);
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
