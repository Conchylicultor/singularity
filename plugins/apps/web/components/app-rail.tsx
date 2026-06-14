import { cn, CHROME_THEME_SCOPE } from "@plugins/primitives/plugins/ui-kit/web";
import { WithTooltip } from "@plugins/primitives/plugins/tooltip/web";
import { Apps } from "../slots";
import { useActiveApp } from "../internal/use-active-app";
import { useTabs } from "../internal/use-tabs";

export function AppRail() {
  // Self-sufficient: the rail derives its own active-app highlight rather than
  // taking it as a prop, so a framing variant can render <AppRail/> with no
  // wiring. Width reads the same `--app-rail-width` var its parent variant sets
  // (single source of truth — no `w-10`-vs-`2.5rem` drift).
  const activeAppId = useActiveApp()?.id;
  const { focusedTabId, replaceTabApp } = useTabs();
  return (
    <div
      data-theme-scope={CHROME_THEME_SCOPE}
      className="relative z-nav flex w-(--app-rail-width) shrink-0 flex-col items-center gap-xs border-r bg-background pt-md"
    >
      <Apps.App.Render>
        {(app) => (
          <WithTooltip content={app.tooltip} side="right">
            <button
              onClick={app.onClick ?? (() => replaceTabApp(focusedTabId, app.id))}
              className={cn(
                "relative flex size-8 items-center justify-center rounded-md text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                app.id === activeAppId &&
                  "bg-sidebar-accent text-sidebar-accent-foreground",
              )}
            >
              <app.icon className="size-4" />
              {app.badge && (
                <span className="pointer-events-none absolute right-1 top-1">
                  <app.badge />
                </span>
              )}
            </button>
          </WithTooltip>
        )}
      </Apps.App.Render>
    </div>
  );
}
