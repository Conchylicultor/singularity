import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { pagesRootPane } from "./panes";

export { PagesWelcome } from "./slots";

export default {
  description:
    "Landing surface for the Pages app (shown at bare `/pages`): a quick-create + recent-pages launchpad rendered through the PagesWelcome.Section slot.",
  contributions: [Pane.Register({ pane: pagesRootPane })],
} satisfies PluginDefinition;
