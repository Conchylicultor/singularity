import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { MdCallMerge, MdChevronRight } from "react-icons/md";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { GroupRename } from "./group-rename";

export function AutoGroupBox({
  clusterKey,
  title,
  rootConvIds,
  onRename,
  children,
}: {
  clusterKey: string;
  title: string;
  rootConvIds: string[];
  onRename: (next: string) => void | Promise<void>;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(`auto-group:collapsed:${clusterKey}`) === "1";
    } catch {
      return false;
    }
  });

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(`auto-group:collapsed:${clusterKey}`, next ? "1" : "0");
      } catch {}
      return next;
    });
  };

  const droppable = useDroppable({
    id: `drop-auto-group-${clusterKey}`,
    data: { kind: "auto-group", rootConvIds, title } as const,
  });

  return (
    <div
      ref={droppable.setNodeRef}
      className={cn(
        "rounded-md border border-dashed border-border/50 bg-muted/10 px-1 py-1 transition-colors",
        droppable.isOver && "border-primary/60 bg-accent/40",
      )}
    >
      <div className="group/header flex items-center gap-0.5">
        <MdCallMerge className="size-3.5 shrink-0 text-muted-foreground" />
        <GroupRename value={title} onSave={onRename} />
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? "Expand group" : "Collapse group"}
          className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent"
        >
          <MdChevronRight
            className={cn("size-4 transition-transform", !collapsed && "rotate-90")}
          />
        </button>
      </div>
      {!collapsed && <div className="mt-0.5 pl-1">{children}</div>}
    </div>
  );
}
