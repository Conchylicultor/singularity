import { useDroppable } from "@dnd-kit/core";
import { MdChevronRight, MdDeleteOutline } from "react-icons/md";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { ConversationGroup } from "../../shared";
import { GroupRename } from "./group-rename";

export function GroupBox({
  group,
  isEmpty,
  onRename,
  onToggleExpanded,
  onDelete,
  children,
}: {
  group: ConversationGroup;
  isEmpty: boolean;
  onRename: (next: string) => void | Promise<void>;
  onToggleExpanded: (next: boolean) => void | Promise<void>;
  onDelete: () => void | Promise<void>;
  children: ReactNode;
}) {
  const droppable = useDroppable({
    id: `drop-group-${group.id}`,
    data: { kind: "group", groupId: group.id } as const,
  });

  return (
    <div
      ref={droppable.setNodeRef}
      className={cn(
        "rounded-md border border-border/60 bg-muted/20 px-1 py-1 transition-colors",
        droppable.isOver && "border-primary/60 bg-accent/40",
      )}
    >
      <div className="group/header flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => void onToggleExpanded(!group.expanded)}
          aria-label={group.expanded ? "Collapse group" : "Expand group"}
          className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent"
        >
          <MdChevronRight
            className={cn("size-4 transition-transform", group.expanded && "rotate-90")}
          />
        </button>
        <GroupRename value={group.title} onSave={onRename} />
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
      </div>
      {group.expanded && (
        <div className="mt-0.5 pl-1">
          {isEmpty ? (
            <div className="px-2 py-1 text-[11px] text-muted-foreground italic">
              Empty — drop a conversation here
            </div>
          ) : (
            children
          )}
        </div>
      )}
    </div>
  );
}
