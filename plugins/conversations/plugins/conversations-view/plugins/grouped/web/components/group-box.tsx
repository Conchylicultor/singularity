import { MdDeleteOutline, MdDragIndicator } from "react-icons/md";
import type { ReactNode } from "react";
import { useDraggable } from "@dnd-kit/core";
import { RowActionButton } from "@plugins/primitives/plugins/row-actions/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import type { ConversationGroup } from "../../shared";
import { GroupContainer } from "./group-container";
import { GroupRename } from "./group-rename";

export function GroupBox({
  group,
  isEmpty,
  count,
  onRename,
  onToggleExpanded,
  onDelete,
  dragInProgress,
  hasActiveChild,
  autoFocusRename,
  onRenameFocused,
  children,
}: {
  group: ConversationGroup;
  isEmpty: boolean;
  count: number;
  onRename: (next: string) => void | Promise<void>;
  onToggleExpanded: (next: boolean) => void | Promise<void>;
  onDelete: () => void | Promise<void>;
  dragInProgress: boolean;
  hasActiveChild?: boolean;
  autoFocusRename?: boolean;
  onRenameFocused?: () => void;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef: setHandleRef } = useDraggable({
    id: `group-${group.id}`,
    data: { kind: "drag-group", groupId: group.id },
  });

  return (
    <GroupContainer
      droppableId={`drop-group-${group.id}`}
      dropData={{ kind: "group", groupId: group.id }}
      expanded={group.expanded}
      onToggleExpanded={() => onToggleExpanded(!group.expanded)}
      dragInProgress={dragInProgress}
      hasActiveChild={hasActiveChild}
      count={count}
      title={
        <GroupRename
          value={group.title}
          onSave={onRename}
          autoFocus={autoFocusRename}
          onFocused={onRenameFocused}
          className={isEmpty ? "text-muted-foreground/50" : undefined}
        />
      }
      trailingAction={
        <Stack direction="row" align="center" gap="2xs">
          <button
            ref={setHandleRef}
            {...attributes}
            {...listeners}
            type="button"
            aria-label="Reorder group"
            className="cursor-grab rounded-md text-muted-foreground opacity-0 pointer-events-none hover:bg-accent hover:text-foreground group-hover/header:opacity-100 group-hover/header:pointer-events-auto touch-none"
          >
            <Center className="size-5">
              <MdDragIndicator className="size-3.5" />
            </Center>
          </button>
          <RowActionButton
            icon={MdDeleteOutline}
            label={
              isEmpty
                ? "Delete group"
                : "Delete group (members return to ungrouped)"
            }
            onClick={(e) => {
              e.stopPropagation();
              return onDelete();
            }}
            className="opacity-0 pointer-events-none group-hover/header:opacity-100 group-hover/header:pointer-events-auto"
          />
        </Stack>
      }
    >
      {isEmpty ? (
        <div className="px-sm py-xs text-2xs text-muted-foreground italic">
          Empty — drop a conversation here
        </div>
      ) : (
        children
      )}
    </GroupContainer>
  );
}
