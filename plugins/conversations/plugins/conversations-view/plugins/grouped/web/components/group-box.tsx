import { MdDeleteOutline } from "react-icons/md";
import type { ReactNode } from "react";
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
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            void onDelete();
          }}
          aria-label="Delete group"
          className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 hover:bg-accent hover:text-foreground group-hover/header:opacity-100"
          title={
            isEmpty
              ? "Delete group"
              : "Delete group (members return to ungrouped)"
          }
        >
          <MdDeleteOutline className="size-3.5" />
        </button>
      }
    >
      {isEmpty ? (
        <div className="px-2 py-1 text-[11px] text-muted-foreground italic">
          Empty — drop a conversation here
        </div>
      ) : (
        children
      )}
    </GroupContainer>
  );
}
