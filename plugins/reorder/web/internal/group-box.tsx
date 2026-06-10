import { useContext, type CSSProperties, type ReactNode } from "react";
import {
  MdClose,
  MdDragIndicator,
} from "react-icons/md";
import { CollapsibleChevron } from "@plugins/primitives/plugins/collapsible/web";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import {
  type ReorderGroup,
  patchGroup,
  deleteGroup,
} from "@plugins/reorder/plugins/groups/core";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { DRAG_GROUP_PREFIX } from "@plugins/reorder/plugins/editor/web";
import { ReorderEffectiveEditModeContext } from "./effective-edit-mode";
import { GroupRename } from "./group-rename";

export function ReorderGroupBox({
  group,
  storageId,
  editMode: editModeProp,
  autoFocusRename,
  onRenameFocused,
  children,
}: {
  group: ReorderGroup;
  storageId: string;
  editMode: boolean;
  autoFocusRename?: boolean;
  onRenameFocused?: () => void;
  children: ReactNode;
}) {
  // An area-level override (popover regime's inline render) forces display-only
  // so the inline group box drops its drag/delete chrome even though the entry
  // was built with the global edit-mode prop.
  const override = useContext(ReorderEffectiveEditModeContext);
  const editMode = override ?? editModeProp;

  const { attributes, listeners, setNodeRef: setDragRef, transform, isDragging } = useDraggable({
    id: `${DRAG_GROUP_PREFIX}${group.id}`,
    data: { kind: "drag-group", groupId: group.id },
    disabled: !editMode,
  });

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `group-join:${group.id}`,
    data: { zone: "group-join", groupId: group.id },
  });

  const effectiveExpanded = isDragging ? false : group.expanded;

  function handleDelete() {
    void fetchEndpoint(deleteGroup, { id: group.id }, {
      body: { slotId: storageId },
    });
  }

  function handleRename(next: string) {
    void fetchEndpoint(patchGroup, { id: group.id }, {
      body: { slotId: storageId, title: next },
    });
  }

  function handleToggleExpanded() {
    void fetchEndpoint(patchGroup, { id: group.id }, {
      body: { slotId: storageId, expanded: !group.expanded },
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
          className="flex size-4 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
        >
          <CollapsibleChevron open={effectiveExpanded} className="size-3.5" />
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
              className="flex size-5 shrink-0 cursor-grab items-center justify-center rounded-md text-muted-foreground opacity-0 hover:bg-accent hover:text-foreground group-hover/header:opacity-100 touch-none"
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
              className="flex size-5 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 hover:bg-accent hover:text-foreground group-hover/header:opacity-100"
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
            <div className="px-1 py-1 text-2xs text-muted-foreground italic">
              Drop items here
            </div>
          )}
        </div>
      )}
    </div>
  );
}
