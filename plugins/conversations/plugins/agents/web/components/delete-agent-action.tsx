import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { MdDelete } from "react-icons/md";
import type { ItemActionProps } from "@plugins/primitives/plugins/data-view/web";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { deleteAgent } from "@plugins/conversations/plugins/agents/core";
import type { Agent } from "../../shared/resources";

export function DeleteAgentAction({ row, hasChildren }: ItemActionProps<Agent>) {
  const agentId = row.id;
  const disabled = hasChildren;
  const title = disabled
    ? "Delete (only leaf agents can be deleted)"
    : "Delete agent";

  const onClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled) return;
    await fetchEndpoint(deleteAgent, { id: agentId });
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label="Delete agent"
      className={cn(
        "hover:bg-background/60 flex size-6 shrink-0 items-center justify-center rounded-md",
        disabled && "cursor-not-allowed opacity-30 hover:bg-transparent",
      )}
    >
      <MdDelete className="size-4" />
    </button>
  );
}
