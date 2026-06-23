import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useDroppable } from "@dnd-kit/core";

export function NewGroupDropZone({ visible }: { visible: boolean }) {
  const { setNodeRef, isOver } = useDroppable({
    id: "drop-new-group",
    data: { kind: "new-group" } as const,
  });

  if (!visible) return null;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "rounded-md border border-dashed border-border/60 bg-muted/10 px-md py-sm text-center text-2xs text-muted-foreground transition-colors",
        isOver && "border-primary/70 bg-accent/40 text-foreground",
      )}
    >
      Drop here to create a new group
    </div>
  );
}
