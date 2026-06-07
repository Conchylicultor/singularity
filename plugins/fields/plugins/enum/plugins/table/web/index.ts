import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { DataViewSlots } from "@plugins/primitives/plugins/data-view/web";
import { EnumCell } from "./components/enum-cell";

export default {
  name: "Fields: Select — Table",
  description: "Enum (select) field type: data-view table cell (read-only chip cell).",
  contributions: [DataViewSlots.Cell({ match: "enum", component: EnumCell })],
} satisfies PluginDefinition;
