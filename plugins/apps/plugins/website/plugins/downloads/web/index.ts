import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { WebsiteHeader } from "@plugins/apps/plugins/website/plugins/shell/web";
import { downloadsPane } from "./panes";
import { DownloadNavItem } from "./components/download-nav-item";

export { downloadsPane } from "./panes";

export default {
  description:
    "Downloads page for the equin website: the /website/download pane (per-platform download cards, current-platform highlight) plus the primary Download CTA in the shared site header.",
  contributions: [
    // This pane BORROWS the shared site header (`actions: WebsiteHeader`), so it
    // mints no slot of its own and is deliberately absent from `slots:` — the
    // header is declared once, by `apps.website.shell`.
    Pane.Register({ pane: downloadsPane }),
    WebsiteHeader({ id: "download", component: DownloadNavItem }),
  ],
} satisfies PluginDefinition;
