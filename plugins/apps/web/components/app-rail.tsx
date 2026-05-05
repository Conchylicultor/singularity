import type { ComponentType, ReactNode } from "react";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type AppItem = {
  id: string;
  icon: ComponentType<{ className?: string }>;
  tooltip: string;
  path: string;
  onClick?: () => void;
};

function navigateToPath(path: string) {
  if (window.location.pathname === path) return;
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function AppRail<T extends AppItem>({
  items,
  activeAppId,
  DndWrapper,
  ReorderItem,
}: {
  items: T[];
  activeAppId: string | undefined;
  DndWrapper: ComponentType<{ children: ReactNode }>;
  ReorderItem: ComponentType<{ item: T; children: ReactNode }>;
}) {
  return (
    <div className="relative z-20 flex w-10 shrink-0 flex-col items-center gap-1 border-r bg-background pt-3">
      <DndWrapper>
        {items.map((app) => (
          <ReorderItem key={app.id} item={app}>
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    onClick={app.onClick ?? (() => navigateToPath(app.path))}
                    className={cn(
                      "flex size-8 items-center justify-center rounded-md text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                      app.id === activeAppId &&
                        "bg-sidebar-accent text-sidebar-accent-foreground",
                    )}
                  >
                    <app.icon className="size-4" />
                  </button>
                }
              />
              <TooltipContent side="right">{app.tooltip}</TooltipContent>
            </Tooltip>
          </ReorderItem>
        ))}
      </DndWrapper>
    </div>
  );
}
