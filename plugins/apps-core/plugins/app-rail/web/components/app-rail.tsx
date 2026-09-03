import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Theme } from "@plugins/primitives/plugins/css/plugins/theme-boundary/web";
import { WithTooltip } from "@plugins/primitives/plugins/overlay/plugins/tooltip/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Pin } from "@plugins/primitives/plugins/css/plugins/pin/web";
import { Apps, useActiveApp } from "@plugins/apps-core/web";
import { AppIconView } from "@plugins/apps-core/plugins/app-icon/web";
import { useChromeThemeScope } from "@plugins/apps-core/plugins/theme-scope/web";
import { useTabs } from "@plugins/apps-core/plugins/tabs/web";

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
    <Theme
      as={Stack}
      align="center"
      gap="xs"
      // The rail is now a complete theme boundary. The portal forward is NEW:
      // the rail carried the scope attribute and painted, but forwarded nothing,
      // so a menu or tooltip opened from a rail button portaled out of the
      // subtree and came back wearing the desktop theme instead of the app's.
      name={themeScope}
      // `canvas`, NOT `chrome`, and deliberately so: the rail is chrome
      // furniture, but today it paints from the content palette (`--background`)
      // while the tab strip beside it paints from the sidebar palette
      // (`--sidebar`). Saying `chrome` here would restyle the rail, which is a
      // real design question about its tone — filed as its own task — not
      // something to smuggle into a mechanical conversion. Leave it as `canvas`
      // until that question is answered.
      surface="canvas"
      // eslint-disable-next-line layout/no-adhoc-layout -- rigid rail sibling of the flexible body in the framing row; shrink-0 keeps its fixed width
      className="relative z-nav w-(--app-rail-width) shrink-0 border-r pt-md"
    >
      <Apps.App.Render>
        {(entry) => (
          <WithTooltip content={entry.app.name} side="right">
            <Center
              as="button"
              // Icon-only button: the tooltip is invisible to the a11y tree, so
              // the app name must ALSO be the accessible name.
              aria-label={entry.app.name}
              onClick={
                entry.onClick ?? (() => replaceTabApp(focusedTabId, entry.id))
              }
              className={cn(
                "relative size-8 rounded-md text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                entry.id === activeAppId &&
                  "bg-sidebar-accent text-sidebar-accent-foreground",
              )}
            >
              <AppIconView icon={entry.icon} className="size-4" />
              {entry.badge && (
                <Pin to="top-right" offset="xs" decorative>
                  <entry.badge />
                </Pin>
              )}
            </Center>
          </WithTooltip>
        )}
      </Apps.App.Render>
    </Theme>
  );
}
