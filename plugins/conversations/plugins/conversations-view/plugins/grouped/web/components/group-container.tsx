import type { ReactNode } from "react";
import { useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { CollapsibleChevron } from "@plugins/primitives/plugins/collapsible/web";

export function GroupContainer({
  droppableId,
  dropData,
  expanded,
  onToggleExpanded,
  dragInProgress,
  hasActiveChild,
  leadingIcon,
  title,
  count,
  trailingAction,
  children,
}: {
  droppableId: string;
  dropData: Record<string, unknown>;
  expanded: boolean;
  onToggleExpanded: () => void | Promise<void>;
  // While a drag is in progress, every group visually collapses to its header
  // so headers remain reachable without scrolling. We do NOT auto-expand on
  // hover — the user must drop on the header itself to join a group.
  dragInProgress: boolean;
  // True when a child conversation is the active one and the group is collapsed.
  hasActiveChild?: boolean;
  leadingIcon?: ReactNode;
  title: ReactNode;
  count?: number;
  trailingAction?: ReactNode;
  children: ReactNode;
}) {
  const droppable = useDroppable({ id: droppableId, data: dropData });

  const effectiveExpanded = dragInProgress ? false : expanded;

  return (
    <div
      ref={droppable.setNodeRef}
      className={cn(
        "group/box rounded-md transition-colors",
        "hover:bg-muted/30",
        droppable.isOver && "bg-accent/40 ring-1 ring-primary/60",
      )}
    >
      <div
        className={cn(
          "group/header flex items-center gap-0.5 rounded-md px-1 py-1",
          !effectiveExpanded && hasActiveChild && "bg-sidebar-accent/50",
        )}
      >
        <button
          type="button"
          onClick={() => void onToggleExpanded()}
          aria-label={expanded ? "Collapse group" : "Expand group"}
          className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent"
        >
          <CollapsibleChevron open={effectiveExpanded} className="size-4" />
        </button>
        {leadingIcon}
        {title}
        {count !== undefined && count > 0 && (
          <span className="shrink-0 rounded px-1 py-0.5 text-[10px] tabular-nums text-muted-foreground opacity-0 transition-opacity group-hover/header:opacity-100">
            {count}
          </span>
        )}
        {trailingAction}
      </div>
      {effectiveExpanded && <div className="mt-0.5 pl-1">{children}</div>}
    </div>
  );
}
