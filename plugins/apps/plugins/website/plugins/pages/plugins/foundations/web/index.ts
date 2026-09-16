import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { foundationsPane } from "./panes";
import { WebsiteFoundations } from "./slots";

export { foundationsPane } from "./panes";
export { WebsiteFoundations } from "./slots";

export default {
  description:
    "The technical foundations page of the equin website: the /website/foundations pane on how equin is built — framework, harness, plugin system (a placeholder heading for now) — and the WebsiteFoundations.Section slot the page is written into.",
  contributions: [
    // This pane BORROWS the shared site header (`actions: WebsiteHeader`), so it
    // mints no slot of its own. It adds no nav link: the homepage's first layer
    // card is the way in.
    Pane.Register({ pane: foundationsPane }),
  ],
  slots: { ...WebsiteFoundations },
} satisfies PluginDefinition;
