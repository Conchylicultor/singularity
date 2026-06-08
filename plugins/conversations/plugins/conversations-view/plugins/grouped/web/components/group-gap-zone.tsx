import { useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import type { DropTarget } from "./draggable-row";

export function GroupGapZone({
  prevGroupId,
  nextGroupId,
  visible,
}: {
  prevGroupId: string | null;
  nextGroupId: string | null;
  visible: boolean;
}) {
  const data: DropTarget = { kind: "group-gap", prevGroupId, nextGroupId };
  const id = `group-gap-${prevGroupId ?? "start"}-${nextGroupId ?? "end"}`;
  const { setNodeRef, isOver } = useDroppable({ id, data, disabled: !visible });

  if (!visible) return null;

  return (
    <div ref={setNodeRef} className={cn("relative z-raised h-4 -my-2")}>
      {isOver && (
        <div className="absolute inset-x-2 top-1/2 h-0.5 -translate-y-1/2 rounded bg-primary" />
      )}
    </div>
  );
}
