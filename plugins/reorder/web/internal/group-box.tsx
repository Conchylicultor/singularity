import type { CSSProperties, ReactNode } from "react";
import {
  MdChevronRight,
  MdClose,
  MdDragIndicator,
} from "react-icons/md";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import type { ReorderGroup } from "@plugins/reorder/plugins/groups/shared";
import { GroupRename } from "./group-rename";

export function ReorderGroupBox({
  group,
  storageId,
  editMode,
  dragInProgress,
  autoFocusRename,
  onRenameFocused,
  children,
}: {
  group: ReorderGroup;
  storageId: string;
  editMode: boolean;
  dragInProgress: boolean;
  autoFocusRename?: boolean;
  onRenameFocused?: () => void;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef: setDragRef, transform, isDragging } = useDraggable({
    id: `reorder-drag-group-${group.id}`,
    data: { kind: "drag-group", groupId: group.id },
    disabled: !editMode,
  });

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `reorder-drop-group-${group.id}`,
    data: { zone: "group-join", groupId: group.id },
  });

  const effectiveExpanded = (dragInProgress || isDragging) ? false : group.expanded;

  function handleDelete() {
    void fetch(`/api/reorder/groups/${group.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotId: storageId }),
    });
  }

  function handleRename(next: string) {
    void fetch(`/api/reorder/groups/${group.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotId: storageId, title: next }),
    });
  }

  function handleToggleExpanded() {
    void fetch(`/api/reorder/groups/${group.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotId: storageId, expanded: !group.expanded }),
    });
  }

  const hasChildren = children !== null && children !== undefined;

  const style: CSSProperties = isDragging
    ? {
        transform: transform
          ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
          : undefined,
        touchAction: "none",
        zIndex: 50,
      }
    : { touchAction: "none" };

  return (
    <div
      ref={(node) => {
        setDragRef(node);
        setDropRef(node);
      }}
      style={style}
      className={cn(
        "rounded-md border border-border/50 transition-colors",
        isOver && "border-primary/60 bg-accent/20",
        isDragging && "opacity-80 shadow-lg",
      )}
    >
      <div className="group/header flex items-center gap-0.5 px-1.5 py-1">
        <button
          type="button"
          onClick={handleToggleExpanded}
          className="flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
        >
          <MdChevronRight
            className={cn(
              "size-3.5 transition-transform",
              effectiveExpanded && "rotate-90",
            )}
          />
        </button>
        <GroupRename
          value={group.title}
          onSave={handleRename}
          autoFocus={autoFocusRename}
          onFocused={onRenameFocused}
        />
        {editMode && (
          <div className="flex items-center gap-0.5">
            <button
              {...attributes}
              {...listeners}
              type="button"
              aria-label="Drag group"
              className="flex size-5 shrink-0 cursor-grab items-center justify-center rounded text-muted-foreground opacity-0 hover:bg-accent hover:text-foreground group-hover/header:opacity-100 touch-none"
            >
              <MdDragIndicator className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleDelete();
              }}
              aria-label="Delete group"
              className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 hover:bg-accent hover:text-foreground group-hover/header:opacity-100"
              title="Delete group (items return to ungrouped)"
            >
              <MdClose className="size-3.5" />
            </button>
          </div>
        )}
      </div>
      {effectiveExpanded && (
        <div className="px-1.5 pb-1.5">
          {hasChildren ? (
            children
          ) : (
            <div className="px-1 py-1 text-[11px] text-muted-foreground italic">
              Drop items here
            </div>
          )}
        </div>
      )}
    </div>
  );
}
