import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import type { ReactElement, ReactNode } from "react";
import { useMultiSelect } from "./use-multi-select";

export type SelectionBarProps = {
  actions?: ReactNode;
  className?: string;
};

export function SelectionBar({
  actions,
  className,
}: SelectionBarProps): ReactElement {
  const { selectedCount, isActive, selectAll, clearAll } = useMultiSelect();

  return (
    <div className="sticky top-0 z-float h-0 w-full">
      <div
        className={cn(
          "absolute top-1 left-1/2 -translate-x-1/2",
          "flex items-center gap-sm whitespace-nowrap rounded-lg border bg-background/95 px-lg py-sm text-body shadow-lg backdrop-blur",
          "transition-all duration-200",
          isActive
            ? "translate-y-0 opacity-100"
            : "pointer-events-none -translate-y-2 opacity-0",
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
            <div className="flex items-center gap-xs">{actions}</div>
          </>
        )}
      </div>
    </div>
  );
}
