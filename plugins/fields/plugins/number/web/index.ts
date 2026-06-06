import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Fields } from "@plugins/fields/web";
import { DataViewSlots } from "@plugins/primitives/plugins/data-view/web";
import { numberIdentity } from "../core";
import { NumberCell } from "./components/number-cell";
import { NumberFilter } from "./components/number-filter";
import { predicate, isActive } from "./internal/number-filter-logic";

export default {
  name: "Fields: Number",
  description:
    "Number field type: identity plus the data-view cell and filter (min/max) capabilities.",
  contributions: [
    Fields.Identity({ identity: numberIdentity }),
    DataViewSlots.Cell({ match: "number", component: NumberCell }),
    DataViewSlots.Filter({
      match: "number",
      Control: NumberFilter,
      predicate,
      isActive,
    }),
  ],
} satisfies PluginDefinition;
