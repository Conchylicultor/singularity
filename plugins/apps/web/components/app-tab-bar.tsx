import { MdAdd } from "react-icons/md";
import { cn } from "@plugins/primitives/plugins/ui-kit/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { Text } from "@plugins/primitives/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/spacing/web";
import { Apps } from "../slots";
import { useTabs } from "../internal/use-tabs";

/**
 * Horizontal tab bar above the app content (parallel to {@link AppRail}). One
 * chip per open tab — app icon + label drawn from the matching `Apps.App`
 * contribution — with an active highlight on the focused tab; clicking focuses
 * it. The trailing `+` opens a new Home tab. Close/reorder are follow-ups.
 */
export function AppTabBar() {
  const { tabs, focusedTabId, focusTab, openTab, titles } = useTabs();
  const apps = Apps.App.useContributions();

  return (
    <Stack
      direction="row"
      align="center"
      gap="2xs"
      className="shrink-0 border-b bg-background px-xs py-2xs"
    >
      {tabs.map((tab) => {
        const app = apps.find((a) => a.id === tab.appId);
        if (!app) return null;
        const Icon = app.icon;
        const active = tab.tabId === focusedTabId;
        // The tab's selected content (page / conversation / song …); the app
        // name is the fallback when the tab is at its index or has no title.
        const label = titles[tab.tabId] ?? app.tooltip;
        return (
          <button
            key={tab.tabId}
            data-app-tab={tab.appId}
            aria-pressed={active}
            onClick={() => focusTab(tab.tabId)}
            className={cn(
              "flex max-w-40 items-center rounded-md px-xs py-2xs text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              active && "bg-sidebar-accent text-sidebar-accent-foreground",
            )}
          >
            <Stack direction="row" align="center" gap="xs">
              <Icon className="size-4 shrink-0" />
              <Text variant="label" className="truncate">
                {label}
              </Text>
            </Stack>
          </button>
        );
      })}
      <IconButton
        icon={MdAdd}
        label="New tab"
        size="icon-sm"
        onClick={() => openTab("home")}
      />
    </Stack>
  );
}
