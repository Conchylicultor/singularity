import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { tableDetailPane } from "./panes";

export { TableDetail } from "./slots";
export { tableDetailPane } from "./panes";

export default {
  description:
    "Per-table detail pane (with an extensible section slot) opened from the Contributions Tables tab.",
  contributions: [Pane.Register({ pane: tableDetailPane })],
} satisfies PluginDefinition;
