import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { DataViewSlots } from "@plugins/primitives/plugins/data-view/web";
import { DateFilter } from "./components/date-filter";
import { predicate, isActive } from "./internal/date-filter-logic";

export default {
  description: "Date field type: data-view filter (inclusive date-range control).",
  contributions: [
    DataViewSlots.Filter({
      match: "date",
      Control: DateFilter,
      predicate,
      isActive,
    }),
  ],
} satisfies PluginDefinition;
