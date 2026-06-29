import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Apps } from "@plugins/apps-core/web";
import { MdPublic } from "react-icons/md";
import { mdAppIcon } from "@plugins/apps-core/plugins/app-icon/web";
import { browserApp } from "../core";
import { BrowserLayout } from "./components/browser-layout";

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
      id: browserApp.id,
      icon: mdAppIcon(MdPublic),
      tooltip: "Browser",
      component: BrowserLayout,
      path: browserApp.basePath,
    }),
  ],
} satisfies PluginDefinition;
