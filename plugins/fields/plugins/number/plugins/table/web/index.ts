import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { DataViewSlots } from "@plugins/primitives/plugins/data-view/web";
import { NumberCell } from "./components/number-cell";

export default {
  name: "Fields: Number — Table",
  description: "Number field type: data-view table cell (read-only numeric cell).",
  contributions: [DataViewSlots.Cell({ match: "number", component: NumberCell })],
} satisfies PluginDefinition;
