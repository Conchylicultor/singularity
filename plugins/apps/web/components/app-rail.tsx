import { WithTooltip } from "@plugins/primitives/plugins/tooltip/web";
import { cn } from "@/lib/utils";
import { Apps } from "../slots";

function navigateToPath(path: string) {
  if (window.location.pathname === path) return;
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function AppRail({
  activeAppId,
}: {
  activeAppId: string | undefined;
}) {
  return (
    <div className="relative z-nav flex w-10 shrink-0 flex-col items-center gap-1 border-r bg-background pt-3">
      <Apps.App.Render>
        {(app) => (
          <WithTooltip content={app.tooltip} side="right">
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
          </WithTooltip>
        )}
      </Apps.App.Render>
    </div>
  );
}
