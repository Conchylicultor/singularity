import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Apps } from "@plugins/apps-core/web";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { MdPublic } from "react-icons/md";
import { mdAppIcon } from "@plugins/apps-core/plugins/app-icon/web";
import { websiteApp } from "../core";
import { WebsiteLayout } from "./components/website-layout";
import { WebsiteWordmark } from "./components/website-wordmark";
import { WebsiteToolbar } from "./slots";
import { landingPane } from "./panes";

export { Website, WebsiteToolbar } from "./slots";
export { WebsiteNavLink } from "./components/website-nav-link";
export { WebsitePage } from "./components/website-page";
export { landingPane } from "./panes";

export default {
  description:
    "App shell for the Website (equin public site). Registers the /website app entry and the landing pane, owns the shared site toolbar (wordmark + nav zones) every site pane opts into, and defines the Website.Section landing slot.",
  contributions: [
    Apps.App({
      id: websiteApp.id,
      icon: mdAppIcon(MdPublic),
      tooltip: "equin",
      component: WebsiteLayout,
      path: websiteApp.basePath,
    }),
    WebsiteToolbar.Start({ id: "wordmark", component: WebsiteWordmark }),
    Pane.Register({ pane: landingPane }),
  ],
} satisfies PluginDefinition;
