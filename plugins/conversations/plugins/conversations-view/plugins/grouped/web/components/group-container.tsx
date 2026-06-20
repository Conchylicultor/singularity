import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import type { ReactNode } from "react";
import { useDroppable } from "@dnd-kit/core";
import { CollapsibleChevron } from "@plugins/primitives/plugins/collapsible/web";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { Frame } from "@plugins/primitives/plugins/css/plugins/frame/web";

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
      <Frame
        gap="2xs"
        className={cn(
          "group/header rounded-md px-xs py-xs",
          !effectiveExpanded && hasActiveChild && "bg-sidebar-accent/50",
        )}
        leading={
          <>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => onToggleExpanded()}
              aria-label={expanded ? "Collapse group" : "Expand group"}
              className="text-muted-foreground"
            >
              <CollapsibleChevron open={effectiveExpanded} className="size-4" />
            </Button>
            {leadingIcon}
          </>
        }
        content={title}
        trailing={
          <>
            {count !== undefined && count > 0 && (
              <Badge className="pointer-events-none opacity-0 transition-opacity group-hover/header:opacity-100">
                {count}
              </Badge>
            )}
            {trailingAction}
          </>
        }
      />
      {/* eslint-disable-next-line spacing/no-adhoc-spacing -- mt-0.5 nudges the expanded children list just below the header row (sibling under a non-flex container) */}
      {effectiveExpanded && <div className="mt-0.5 pl-xs">{children}</div>}
    </div>
  );
}
