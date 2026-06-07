import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { DataViewSlots } from "@plugins/primitives/plugins/data-view/web";
import { TextFilter } from "./components/text-filter";
import { predicate, isActive } from "./internal/text-filter-logic";

export default {
  name: "Fields: Text — Filter",
  description: "Text field type: data-view filter (substring contains control).",
  contributions: [
    DataViewSlots.Filter({
      match: "text",
      Control: TextFilter,
      predicate,
      isActive,
    }),
  ],
} satisfies PluginDefinition;
