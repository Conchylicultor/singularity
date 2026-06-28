import {
  appThemeScope,
  PortalThemeScopeProvider,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useTabs } from "@plugins/apps-core/plugins/tabs/web";
import { TabSurface } from "./tab-surface";

/**
 * The keep-alive tab surface: every open tab mounted at once, only the focused
 * one visible (`display:none` keeps the rest mounted with their route + React
 * state). Each tab gets its own `PaneSurfaceProvider` binding its store + base
 * path, so background tabs hold their route in memory while the focused tab
 * mirrors to the URL. This is the `body` the rail-framing wraps — it sits to the
 * right of the rail, both below the top-level tab bar.
 */
export function AppTabsBody() {
  const { tabs, focusedTabId } = useTabs();
  return (
    // `transform-gpu` makes this a containing block for `position: fixed`
    // descendants, so an app shell's viewport-pinned sidebar (shadcn
    // `fixed inset-y-0`) bounds to the content area BELOW the tab bar instead of
    // overlapping it. Portalled overlays (floating bar, popovers, dialogs)
    // render at document.body and are unaffected.
    // eslint-disable-next-line layout/no-adhoc-layout -- flexible fill leaf of AppsLayout's column; transform-gpu makes it the containing block for fixed-positioned app sidebars
    <div className="relative min-h-0 min-w-0 flex-1 transform-gpu">
      {tabs.map((tab) => {
        const focused = tab.tabId === focusedTabId;
        return (
          // Tag each tab's subtree with its app scope so a forked app's content
          // is themed by the same central scope block the real surface uses;
          // unforked apps simply inherit the desktop `:root`. The
          // PortalThemeScopeProvider lets portaled descendants re-adopt the scope.
          <div
            key={tab.tabId}
            // eslint-disable-next-line layout/no-adhoc-layout -- keep-alive: every tab is a full-bleed stacked sibling, only the focused one displayed
            className="absolute inset-0"
            data-theme-scope={appThemeScope(tab.appId)}
            style={{ display: focused ? "block" : "none" }}
          >
            <PortalThemeScopeProvider scope={appThemeScope(tab.appId)}>
              <TabSurface tab={tab} />
            </PortalThemeScopeProvider>
          </div>
        );
      })}
    </div>
  );
}
