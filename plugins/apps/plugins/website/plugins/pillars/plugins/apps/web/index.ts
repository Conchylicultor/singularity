import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { WebsiteHeader } from "@plugins/apps/plugins/website/plugins/shell/web";
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
    // This pane BORROWS the shared site header (`actions: WebsiteHeader`), so it
    // mints no slot of its own and is deliberately absent from `slots:` — the
    // header is declared once, by `apps.website.shell`.
    Pane.Register({ pane: appsPane }),
    WebsiteHeader({ id: "apps", component: AppsNavItem }),
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
  slots: { ...WebsiteApps },
} satisfies PluginDefinition;
