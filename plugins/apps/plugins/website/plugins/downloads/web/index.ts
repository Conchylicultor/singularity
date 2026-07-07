import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { WebsiteToolbar } from "@plugins/apps/plugins/website/plugins/shell/web";
import { downloadsPane } from "./panes";
import { DownloadNavItem } from "./components/download-nav-item";

export { downloadsPane } from "./panes";

export default {
  description:
    "Downloads page for the equin website: the /website/download pane (per-platform download cards, current-platform highlight) plus the primary Download CTA in the shared site header.",
  contributions: [
    Pane.Register({ pane: downloadsPane }),
    WebsiteToolbar.End({ id: "download", component: DownloadNavItem }),
  ],
} satisfies PluginDefinition;
