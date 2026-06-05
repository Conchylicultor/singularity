import type { ReactNode } from "react";
import type { SealContributions } from "@plugins/framework/plugins/web-sdk/core";
import { cn } from "@/lib/utils";
import type { DataViewContribution } from "../slots";

export interface ViewSwitcherProps {
  views: SealContributions<DataViewContribution>[];
  activeId: string;
  onSelect: (id: string) => void;
}

export function ViewSwitcher({
  views,
  activeId,
  onSelect,
}: ViewSwitcherProps): ReactNode {
  if (views.length <= 1) return null;

  return (
    <div className="flex items-center gap-0.5 rounded-md border bg-background p-0.5">
      {views.map((v) => {
        const Icon = v.icon;
        const selected = activeId === v.id;
        return (
          <button
            key={v.id}
            type="button"
            onClick={() => onSelect(v.id)}
            aria-pressed={selected}
            title={v.title}
            className={cn(
              "flex items-center justify-center gap-1 rounded-sm px-2 py-1 text-xs",
              selected
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent/50",
            )}
          >
            <Icon className="size-3.5" />
            <span>{v.title}</span>
          </button>
        );
      })}
    </div>
  );
}
