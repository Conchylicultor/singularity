import { MdAdd, MdClose } from "react-icons/md";
import { cn } from "@plugins/primitives/plugins/ui-kit/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { TruncatingText } from "@plugins/primitives/plugins/truncating-text/web";
import { Stack } from "@plugins/primitives/plugins/spacing/web";
import { Apps } from "../slots";
import { useTabs } from "../internal/use-tabs";

/**
 * Horizontal tab bar above the app content (parallel to {@link AppRail}). One
 * chip per open tab — app icon + label drawn from the matching `Apps.App`
 * contribution — with an active highlight on the focused tab; clicking focuses
 * it. Hovering a tab reveals a trailing `×` that closes it. The trailing `+`
 * opens a new Home tab. Reorder is a follow-up.
 */
export function AppTabBar() {
  const { tabs, focusedTabId, focusTab, closeTab, openTab, titles } = useTabs();
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
          <div
            key={tab.tabId}
            data-app-tab={tab.appId}
            className={cn(
              "group flex max-w-40 items-center gap-xs rounded-md py-2xs pl-xs pr-2xs text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              active && "bg-sidebar-accent text-sidebar-accent-foreground",
            )}
          >
            <button
              type="button"
              aria-pressed={active}
              onClick={() => focusTab(tab.tabId)}
              className="flex min-w-0 flex-1 items-center gap-xs"
            >
              <Icon className="size-4 shrink-0" />
              <TruncatingText className="text-label">{label}</TruncatingText>
            </button>
            <button
              type="button"
              aria-label={`Close ${label}`}
              onClick={() => closeTab(tab.tabId)}
              className={cn(
                "flex size-4 shrink-0 items-center justify-center rounded-sm opacity-0 transition-[color,background-color,opacity] hover:bg-sidebar-foreground/10 hover:text-sidebar-accent-foreground group-hover:opacity-100 focus-visible:opacity-100",
                active && "opacity-70",
              )}
            >
              <MdClose className="size-3.5" />
            </button>
          </div>
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
