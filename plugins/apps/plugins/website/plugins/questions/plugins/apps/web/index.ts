import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { WebsiteHeader } from "@plugins/apps/plugins/website/plugins/shell/web";
import { appsPane } from "./panes";
import { WebsiteApps } from "./slots";
import { AppsNavItem } from "./components/apps-nav-item";

export { appsPane } from "./panes";
export { WebsiteApps } from "./slots";

export default {
  description:
    "The applications page of the equin website: the /website/apps pane answering 'what will apps evolve into?', its Apps nav link, and the WebsiteApps.Section slot the answer is written into.",
  contributions: [
    // This pane BORROWS the shared site header (`actions: WebsiteHeader`), so it
    // mints no slot of its own and is deliberately absent from `slots:` — the
    // header is declared once, by `apps.website.shell`.
    Pane.Register({ pane: appsPane }),
    WebsiteHeader({ id: "apps", component: AppsNavItem }),
  ],
  slots: { ...WebsiteApps },
} satisfies PluginDefinition;
