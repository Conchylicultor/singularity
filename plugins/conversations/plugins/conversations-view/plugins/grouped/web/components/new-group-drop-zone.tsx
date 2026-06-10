import { useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";

export function NewGroupDropZone({ visible }: { visible: boolean }) {
  const droppable = useDroppable({
    id: "drop-new-group",
    data: { kind: "new-group" } as const,
  });

  if (!visible) return null;

  return (
    <div
      ref={droppable.setNodeRef}
      className={cn(
        "rounded-md border border-dashed border-border/60 bg-muted/10 px-3 py-2 text-center text-2xs text-muted-foreground transition-colors",
        droppable.isOver && "border-primary/70 bg-accent/40 text-foreground",
      )}
    >
      Drop here to create a new group
    </div>
  );
}
