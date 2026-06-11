import { WithTooltip } from "@plugins/primitives/plugins/tooltip/web";
import { cn } from "@/lib/utils";
import { Apps } from "../slots";
import { useActiveApp } from "../internal/use-active-app";

function navigateToPath(path: string) {
  if (window.location.pathname === path) return;
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function AppRail() {
  // Self-sufficient: the rail derives its own active-app highlight rather than
  // taking it as a prop, so a framing variant can render <AppRail/> with no
  // wiring. Width reads the same `--app-rail-width` var its parent variant sets
  // (single source of truth — no `w-10`-vs-`2.5rem` drift).
  const activeAppId = useActiveApp()?.id;
  return (
    <div className="relative z-nav flex w-(--app-rail-width) shrink-0 flex-col items-center gap-1 border-r bg-background pt-3">
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
