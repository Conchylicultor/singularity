import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { DataViewSlots } from "@plugins/primitives/plugins/data-view/web";
import { EnumOptionsEditor } from "./components/enum-options-editor";

export default {
  description:
    "Enum field type: data-view custom-column add-time config editor (options add/rename/remove).",
  contributions: [
    DataViewSlots.ColumnConfig({ match: "enum", component: EnumOptionsEditor }),
  ],
} satisfies PluginDefinition;
