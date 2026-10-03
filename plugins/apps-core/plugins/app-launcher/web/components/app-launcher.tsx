import { useMemo, type KeyboardEvent } from "react";
import type { Contribution } from "@plugins/framework/plugins/web-sdk/core";
import {
  Apps,
  defaultApp,
  useActiveApp,
  type ActiveApp,
} from "@plugins/apps-core/web";
import { isNodeData, useReorderedEntries } from "@plugins/reorder/web";
import {
  appLinkProps,
  useActivateApp,
} from "@plugins/apps-core/plugins/tabs/web";
import {
  AppIconTile,
  AppIconView,
} from "@plugins/apps-core/plugins/app-icon/web";
import { HoverPopover } from "@plugins/primitives/plugins/overlay/plugins/hover-popover/web";
import { Button, cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Grid } from "@plugins/primitives/plugins/css/plugins/grid/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Pin } from "@plugins/primitives/plugins/css/plugins/pin/web";
import { symbol } from "@plugins/ui/plugins/icons/core";
import { Icon } from "@plugins/ui/plugins/icons/web";
import type { AppShellBrandForm } from "@plugins/primitives/plugins/app-shell/web";

const allAppsIcon = symbol("apps");

/** Tiles per row of the launcher grid — also the ArrowUp/ArrowDown stride. */
const COLS = 4;

const STEP: Record<string, number> = {
  ArrowRight: 1,
  ArrowLeft: -1,
  ArrowDown: COLS,
  ArrowUp: -COLS,
};

/**
 * Arrow keys move between the tiles as a grid (left/right one tile, up/down one
 * row), Home/End to the ends. The tiles are read off the menu's own DOM, in
 * render order.
 */
function onMenuKeyDown(e: KeyboardEvent<HTMLElement>) {
  const items = Array.from(
    e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]'),
  );
  const at = items.findIndex((el) => el === document.activeElement);
  if (at < 0) return;
  let next: number;
  if (e.key === "Home") next = 0;
  else if (e.key === "End") next = items.length - 1;
  else if (e.key in STEP) next = at + STEP[e.key]!;
  else return;
  e.preventDefault();
  items[Math.max(0, Math.min(items.length - 1, next))]?.focus();
}

/**
 * Every installed app but the gallery, in the order the app rail shows them
 * (the `Apps.App` slot's reorder config, read through the same tree its
 * `Render` applies — so the two cannot disagree), apps the user hid included
 * in neither. Layout nodes (spacers, dividers) are the rail's, not apps.
 */
function useLaunchableApps(galleryId: string | undefined): ActiveApp[] {
  const apps = Apps.App.useContributions();
  // The contributions carry `_pluginId` + `id`, all the reorder key needs; they
  // lack `_slot`, so widen through `unknown`.
  const { entries } = useReorderedEntries(
    Apps.App.id,
    apps as unknown as Contribution[],
  );
  return useMemo(
    () =>
      entries
        .filter((e) => !isNodeData(e))
        .map((e) => e as unknown as ActiveApp)
        .filter((a) => a.id !== galleryId),
    [entries, galleryId],
  );
}

/**
 * The launcher button's face: the current app's own mark — its drawn logo when
 * it registers one (`mark`), else its rail glyph — so every app keeps its
 * identity at the top-left. Outside any app, the Equin mark.
 */
function LauncherMark({
  app,
  className,
}: {
  app: ActiveApp | undefined;
  className: string;
}) {
  if (!app) return <img src="/icon.svg" alt="" className={className} />;
  if (app.mark) return <app.mark className={className} />;
  return <AppIconView icon={app.icon} className={className} />;
}

/**
 * The launcher: the current app's mark as an icon button. A click goes to the app
 * gallery — the `Apps.App` entry flagged `default`, found generically, never
 * named — and hovering it (or ArrowDown) reveals every other installed app as
 * a grid of tiles, the current one marked. Picking a tile switches app exactly
 * as the rail does (`useActivateApp`).
 */
export function AppLauncher({ form }: { form: AppShellBrandForm }) {
  const apps = Apps.App.useContributions();
  const gallery = defaultApp(apps);
  const launchable = useLaunchableApps(gallery?.id);
  const active = useActiveApp();
  const activeId = active?.id;
  const activate = useActivateApp();
  // No app registered: nothing to launch, and no gallery to go to.
  if (!gallery) return null;
  const galleryLink = appLinkProps(gallery.app.basePath);

  return (
    <HoverPopover
      label="Apps"
      side="bottom"
      align="start"
      width="picker"
      padding="sm"
      trigger={
        <Button
          variant="ghost"
          aspect="icon"
          aria-label="All apps"
          {...galleryLink}
          className="aria-expanded:bg-hover-fill"
        >
          <LauncherMark
            app={active}
            className={cn(
              form === "header" ? "size-6" : "size-5",
              "transition-transform motion-safe:group-hover/button:-rotate-12 motion-safe:group-aria-expanded/button:-rotate-12",
            )}
          />
        </Button>
      }
      content={({ close }) => (
        <Stack gap="xs">
          <Grid cols={COLS} gap="2xs" role="menu" onKeyDown={onMenuKeyDown}>
            {launchable.map((entry) => {
              const current = entry.id === activeId;
              return (
                <Stack
                  key={entry.id}
                  as="button"
                  role="menuitem"
                  aria-current={current ? "page" : undefined}
                  gap="xs"
                  align="center"
                  onClick={() => {
                    close();
                    activate(entry);
                  }}
                  className="focus-ring relative rounded-lg px-2xs py-sm hover:bg-hover-fill"
                >
                  <AppIconTile
                    icon={entry.icon}
                    appId={entry.id}
                    className="size-9"
                  />
                  <Line className="max-w-full">
                    <Text
                      variant="caption"
                      className={cn(
                        current ? "text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {entry.app.name}
                    </Text>
                  </Line>
                  {current && (
                    <Pin to="bottom" offset="2xs" decorative>
                      <span className="block size-1 rounded-full bg-foreground" />
                    </Pin>
                  )}
                </Stack>
              );
            })}
          </Grid>
          <Line className="border-t pt-xs">
            <Button
              variant="ghost"
              {...galleryLink}
              onClick={(e) => {
                close();
                galleryLink.onClick(e);
              }}
            >
              <Icon icon={allAppsIcon} />
              All apps
            </Button>
          </Line>
        </Stack>
      )}
    />
  );
}
