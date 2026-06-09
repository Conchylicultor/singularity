import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { DataViewSlots } from "@plugins/primitives/plugins/data-view/web";
import { NumberFilter } from "./components/number-filter";
import { predicate, isActive } from "./internal/number-filter-logic";

export default {
  description: "Number field type: data-view filter (min/max range control).",
  contributions: [
    DataViewSlots.Filter({
      match: "number",
      Control: NumberFilter,
      predicate,
      isActive,
    }),
  ],
} satisfies PluginDefinition;
