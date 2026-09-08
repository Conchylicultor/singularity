import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Apps } from "@plugins/apps-core/web";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { MdPublic } from "react-icons/md";
import { mdAppIcon } from "@plugins/apps-core/plugins/app-icon/web";
import { websiteApp } from "../core";
import { WebsiteLayout } from "./components/website-layout";
import { WebsiteWordmark } from "./components/website-wordmark";
import { WebsiteHeader, Website } from "./slots";
import { landingPane } from "./panes";

export { Website, WebsiteHeader } from "./slots";
export { WebsiteNavLink } from "./components/website-nav-link";
export { WebsiteBand } from "./components/website-band";
export { WebsiteChrome } from "./components/website-chrome";
export { landingPane } from "./panes";

export default {
  description:
    "App shell for the Website (equin public site). Registers the /website app entry, owns the shared site header (wordmark + nav) and the band/page/footer chrome every page wears, and defines the Website.Section landing slot.",
  contributions: [
    Apps.App({
      app: websiteApp,
      icon: mdAppIcon(MdPublic),
      component: WebsiteLayout,
    }),
    WebsiteHeader({ id: "wordmark", component: WebsiteWordmark }),
    Pane.Register({ pane: landingPane }),
  ],
  // `header` declares the SHARED site header, which all four pages borrow — so
  // none of them appears in its own plugin's `slots:` record, and the landing
  // pane is not declared here either. Declaring one slot under two names is what
  // the declaration pass rejects.
  slots: { ...Website, header: WebsiteHeader },
} satisfies PluginDefinition;
