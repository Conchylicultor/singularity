import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Apps } from "@plugins/apps-core/web";

import { appIcon } from "@plugins/apps-core/plugins/app-icon/core";
import { browserApp } from "../core";
import { BrowserLayout } from "./components/browser-layout";
import { Browser } from "./slots";
import { symbol } from "@plugins/ui/plugins/icons/core";

export { Browser } from "./slots";
export {
  useBrowserNav,
  useBrowserTabs,
  useBrowserProxy,
  BrowserTabsStore,
} from "./nav-store";
export type {
  BrowserNavApi,
  BrowserTab,
  BrowserTabsState,
  BrowserTabSummary,
  BrowserTabsApi,
  BrowserProxyApi,
} from "./nav-store";
export { Favicon, type FaviconProps } from "./components/favicon";

export default {
  description:
    "App shell for the Browser app. Registers the /browser app entry, owns the per-surface tab store (each tab an independent nav stack), defines the Browser.* slots, and exports the <Favicon> component.",
  contributions: [
    Apps.App({
      app: browserApp,
      icon: appIcon(symbol("public")),
      component: BrowserLayout,
    }),
  ],
  slots: Browser,
} satisfies PluginDefinition;
