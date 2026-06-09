import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { DataViewSlots } from "@plugins/primitives/plugins/data-view/web";
import { BoolFilter } from "./components/bool-filter";
import { predicate, isActive } from "./internal/bool-filter-logic";

export default {
  description: "Boolean field type: data-view filter (yes/no segmented control).",
  contributions: [
    DataViewSlots.Filter({
      match: "bool",
      Control: BoolFilter,
      predicate,
      isActive,
    }),
  ],
} satisfies PluginDefinition;
