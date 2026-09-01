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
export { WebsitePage } from "./components/website-page";
export { landingPane } from "./panes";

export default {
  description:
    "App shell for the Website (equin public site). Registers the /website app entry and the headerless landing pane, owns the shared site header (wordmark + nav) the inner pages wear, and defines the Website.Section landing slot.",
  contributions: [
    Apps.App({
      app: websiteApp,
      icon: mdAppIcon(MdPublic),
      component: WebsiteLayout,
    }),
    WebsiteHeader({ id: "wordmark", component: WebsiteWordmark }),
    Pane.Register({ pane: landingPane }),
  ],
  // `header` declares the SHARED site header, which the two question pages
  // borrow (so they are absent from their own `slots:` records). `landing` is
  // the landing pane's OWN header slot — the homepage wears no nav, so it kept
  // the private one `Pane.define` mints, and a minted slot is declared through
  // its pane.
  slots: { ...Website, header: WebsiteHeader, landing: landingPane },
} satisfies PluginDefinition;
