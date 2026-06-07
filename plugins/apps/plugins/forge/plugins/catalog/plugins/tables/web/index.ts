import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { tableDetailPane } from "./panes";

export { TableDetail } from "./slots";
export { tableDetailPane } from "./panes";

export default {
  name: "Forge: Catalog / Tables",
  description:
    "Per-table detail pane (with an extensible section slot) opened from the catalog's Tables tab.",
  contributions: [Pane.Register({ pane: tableDetailPane })],
} satisfies PluginDefinition;
