import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { WebsiteHeader } from "@plugins/apps/plugins/website/plugins/shell/web";
import { foundationsPane } from "./panes";
import { WebsiteFoundations } from "./slots";
import { FoundationsNavItem } from "./components/foundations-nav-item";

export { foundationsPane } from "./panes";
export { WebsiteFoundations } from "./slots";

export default {
  description:
    "The technical foundations page of the equin website: the /website/foundations pane on how equin is built — framework, harness, plugin system (a placeholder heading for now) — its Foundations nav link, and the WebsiteFoundations.Section slot the page is written into.",
  contributions: [
    // This pane BORROWS the shared site header (`actions: WebsiteHeader`), so it
    // mints no slot of its own and is deliberately absent from `slots:` — the
    // header is declared once, by `apps.website.shell`.
    Pane.Register({ pane: foundationsPane }),
    WebsiteHeader({ id: "foundations", component: FoundationsNavItem }),
  ],
  slots: { ...WebsiteFoundations },
} satisfies PluginDefinition;
