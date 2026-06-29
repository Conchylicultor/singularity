import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { useCustomColumnDefs } from "./internal/use-custom-column-defs";
export type { CustomColumnDefsController } from "./internal/use-custom-column-defs";
export {
  useCustomColumnValues,
  useSetCustomColumnValue,
} from "./internal/use-custom-column-values";
export type { CustomColumnValueIndex } from "./internal/use-custom-column-values";
export { DataViewSettingsButton } from "./components/data-view-settings-button";

export default {
  description:
    "User-defined custom columns for any DataView: the config-backed definition controller, the per-row values live hook + upsert mutation, and the toolbar settings (Fields) button.",
  contributions: [],
} satisfies PluginDefinition;
