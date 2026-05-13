import type { ReactElement, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useMultiSelect } from "./use-multi-select";

export type SelectionBarProps = {
  actions?: ReactNode;
  className?: string;
};

export function SelectionBar({
  actions,
  className,
}: SelectionBarProps): ReactElement | null {
  const { selectedCount, isActive, selectAll, clearAll } = useMultiSelect();

  if (!isActive) return null;

  return (
    <div
      className={cn(
        "sticky top-0 z-20 flex items-center gap-2 border-b bg-background px-2 py-1.5 text-xs",
        className,
      )}
    >
      <span className="font-medium text-foreground">
        {selectedCount} selected
      </span>
      <button
        type="button"
        onClick={selectAll}
        className="text-muted-foreground hover:text-foreground"
      >
        Select all
      </button>
      <button
        type="button"
        onClick={clearAll}
        className="text-muted-foreground hover:text-foreground"
      >
        Clear
      </button>
      {actions && (
        <>
          <div className="bg-border h-4 w-px" />
          <div className="flex items-center gap-1">{actions}</div>
        </>
      )}
    </div>
  );
}
