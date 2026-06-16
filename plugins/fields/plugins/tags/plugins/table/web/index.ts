import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { DataViewSlots } from "@plugins/primitives/plugins/data-view/web";
import { TagsCell } from "./components/tags-cell";

export default {
  description:
    "Tags (multi-value) field type: data-view table cell (read-only tag chips).",
  contributions: [DataViewSlots.Cell({ match: "tags", component: TagsCell })],
} satisfies PluginDefinition;
