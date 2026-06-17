import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Apps } from "@plugins/apps/web";
import { MdPublic } from "react-icons/md";
import { BrowserLayout } from "./components/browser-layout";

export { Browser } from "./slots";
export { useBrowserNav, BrowserNavStore } from "./nav-store";
export type { BrowserNavState, BrowserNavApi } from "./nav-store";
export { Favicon, type FaviconProps } from "./components/favicon";

export default {
  description:
    "App shell for the Browser app. Registers the /browser app entry, owns the per-surface navigation store, defines the Browser.* slots, and exports the <Favicon> component.",
  contributions: [
    Apps.App({
      id: "browser",
      icon: MdPublic,
      tooltip: "Browser",
      component: BrowserLayout,
      path: "/browser",
    }),
  ],
} satisfies PluginDefinition;
