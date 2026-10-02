import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { WebsiteHeader } from "@plugins/apps/plugins/website/plugins/shell/web";
import { visionPane } from "./panes";
import { WebsiteVision } from "./slots";
import { VisionNavItem } from "./components/vision-nav-item";

export { visionPane } from "./panes";
export { WebsiteVision } from "./slots";

export default {
  description:
    "The vision page of the equin website: the /website/vision pane on the vision for applications (a placeholder heading for now), its Vision nav link, and the WebsiteVision.Section slot the page is written into.",
  contributions: [
    // This pane BORROWS the shared site header (`actions: WebsiteHeader`), so it
    // mints no slot of its own and is deliberately absent from `slots:` — the
    // header is declared once, by `apps.website.shell`.
    Pane.Register({ pane: visionPane }),
    WebsiteHeader({ id: "vision", component: VisionNavItem }),
  ],
  slots: { ...WebsiteVision },
} satisfies PluginDefinition;
