import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { DataViewSlots } from "@plugins/primitives/plugins/data-view/web";
import { TagsFilter } from "./components/tags-filter";
import { predicate, isActive } from "./internal/tags-filter-logic";

export default {
  description:
    "Tags (multi-value) field type: data-view filter (multi-select tag chips, array-aware match-any).",
  contributions: [
    DataViewSlots.Filter({
      match: "tags",
      Control: TagsFilter,
      predicate,
      isActive,
    }),
  ],
} satisfies PluginDefinition;
