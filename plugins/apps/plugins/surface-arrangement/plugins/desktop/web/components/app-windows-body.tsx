import { useEffect, useMemo } from "react";
import { MdAdd } from "react-icons/md";
import { useTabs } from "@plugins/apps/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { CHROME_THEME_SCOPE } from "@plugins/primitives/plugins/ui-kit/web";
import { ScopedAppTheme } from "@plugins/ui/plugins/theme-engine/web";
import { WindowFrame } from "./window-frame";
import { pruneWindowGeometry } from "../hooks/use-window-geometry";

/**
 * The desktop surface arrangement: the same keep-alive `Tab[]` laid out as
 * free-floating windows on one backdrop instead of one fullscreen tab. Every
 * window is mounted concurrently (like the tabs arrangement); the focused one
 * owns the URL. A `+` affordance spawns a new window of the focused app.
 */
export function AppWindowsBody() {
  const { tabs, focusedTabId, focusTab, closeTab, openTab, titles } = useTabs();

  // Drop geometry for windows that are no longer open, keyed on the live tab id
  // set so a closed window's box doesn't linger in the per-tab store.
  const openIds = useMemo(() => tabs.map((t) => t.tabId).join(","), [tabs]);
  useEffect(() => {
    pruneWindowGeometry(new Set(tabs.map((t) => t.tabId)));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the id set, not the tab objects
  }, [openIds]);

  // Spawn a new window of the focused window's app (a desktop-local sibling to
  // the tab bar's `+`); fall back to Home if there is somehow no focused tab.
  const spawn = () => {
    const focused = tabs.find((t) => t.tabId === focusedTabId);
    openTab(focused?.appId ?? "home");
  };

  // One scoped theme `<style>` per DISTINCT mounted app — two windows of the same
  // app share a single override block (keyed on app id, not tab id). Each window's
  // subtree is tagged `data-theme-scope="app:<id>"` (see WindowFrame), so these
  // blocks theme inline (non-portaled) content per window while chrome/portals
  // keep the global focused-app theme.
  const appIds = useMemo(() => [...new Set(tabs.map((t) => t.appId))], [tabs]);

  return (
    // The desktop backdrop. `transform-gpu` makes it the containing block for the
    // absolutely-positioned windows (and their fixed-position app chrome), so
    // windows are clipped to the surface below the tab bar.
    <div
      data-theme-scope={CHROME_THEME_SCOPE}
      className="relative h-full w-full overflow-hidden bg-background transform-gpu"
    >
      {appIds.map((id) => (
        <ScopedAppTheme key={id} appId={id} />
      ))}

      {tabs.map((tab) => (
        <WindowFrame
          key={tab.tabId}
          tab={tab}
          focused={tab.tabId === focusedTabId}
          title={titles[tab.tabId]}
          onFocus={() => focusTab(tab.tabId)}
          onClose={() => closeTab(tab.tabId)}
        />
      ))}

      {/* New-window affordance — unobtrusive, bottom-right of the backdrop.
          `bottom`/`right` are positional offsets (not gap/pad/margin), so they
          sit outside the no-adhoc-spacing ramp. */}
      <div className="absolute bottom-4 right-4 z-raised">
        <IconButton
          icon={MdAdd}
          label="New window"
          variant="secondary"
          onClick={spawn}
        />
      </div>
    </div>
  );
}
