import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { DataViewSlots } from "@plugins/primitives/plugins/data-view/web";
import { EnumFilter } from "./components/enum-filter";
import { predicate, isActive } from "./internal/enum-filter-logic";

export default {
  name: "Fields: Select — Filter",
  description: "Enum (select) field type: data-view filter (multi-select option chips).",
  contributions: [
    DataViewSlots.Filter({
      match: "enum",
      Control: EnumFilter,
      predicate,
      isActive,
    }),
  ],
} satisfies PluginDefinition;
