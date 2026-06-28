import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { WithTooltip } from "@plugins/primitives/plugins/tooltip/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Pin } from "@plugins/primitives/plugins/css/plugins/pin/web";
import { Apps } from "../slots";
import { useActiveApp } from "../internal/use-active-app";
import { useChromeThemeScope } from "../internal/use-chrome-theme-scope";
import { useTabs } from "../internal/use-tabs";

export function AppRail() {
  // Self-sufficient: the rail derives its own active-app highlight rather than
  // taking it as a prop, so a framing variant can render <AppRail/> with no
  // wiring. Width reads the same `--app-rail-width` var its parent variant sets
  // (single source of truth — no `w-10`-vs-`2.5rem` drift).
  const activeAppId = useActiveApp()?.id;
  const { focusedTabId, replaceTabApp } = useTabs();
  // Docked/solo → wear the focused app's theme so the rail reads as one surface
  // with it; floating/no-app → inherit the desktop `:root` theme (no attribute).
  // See useChromeThemeScope.
  const themeScope = useChromeThemeScope();
  return (
    <Stack
      align="center"
      gap="xs"
      data-theme-scope={themeScope}
      // eslint-disable-next-line layout/no-adhoc-layout -- rigid rail sibling of the flexible body in the framing row; shrink-0 keeps its fixed width
      className="relative z-nav w-(--app-rail-width) shrink-0 border-r bg-background pt-md"
    >
      <Apps.App.Render>
        {(app) => (
          <WithTooltip content={app.tooltip} side="right">
            <Center
              as="button"
              onClick={app.onClick ?? (() => replaceTabApp(focusedTabId, app.id))}
              className={cn(
                "relative size-8 rounded-md text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                app.id === activeAppId &&
                  "bg-sidebar-accent text-sidebar-accent-foreground",
              )}
            >
              <app.icon className="size-4" />
              {app.badge && (
                <Pin to="top-right" offset="xs" decorative>
                  <app.badge />
                </Pin>
              )}
            </Center>
          </WithTooltip>
        )}
      </Apps.App.Render>
    </Stack>
  );
}
