import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { WebsiteToolbar } from "@plugins/apps/plugins/website/plugins/shell/web";
import { appsPane } from "./panes";
import { WebsiteApps } from "./slots";
import { AppsNavItem } from "./components/apps-nav-item";
import { AppsHero } from "./components/apps-hero";
import { AppsShowcase } from "./components/apps-showcase";
import { AppsClosing } from "./components/apps-closing";

export { appsPane } from "./panes";
export { WebsiteApps } from "./slots";

export default {
  description:
    "Apps pillar page of the equin website: the /website/apps pane showcasing the real apps (Pages, Mail, Sonata, Workflows), its Apps nav link, and the WebsiteApps.Section slot demo plugins contribute into.",
  contributions: [
    Pane.Register({ pane: appsPane }),
    WebsiteToolbar.End({ id: "apps", component: AppsNavItem }),
    WebsiteApps.Section({ id: "hero", label: "Hero", component: AppsHero }),
    WebsiteApps.Section({
      id: "showcase",
      label: "App showcase",
      component: AppsShowcase,
    }),
    WebsiteApps.Section({
      id: "closing",
      label: "Closing links",
      component: AppsClosing,
    }),
  ],
} satisfies PluginDefinition;
