import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { DataViewSlots } from "@plugins/primitives/plugins/data-view/web";
import { CustomColumnFieldExtension } from "./components/custom-column-field-extension";
import { CustomColumnsFieldsSetting } from "./components/custom-columns-setting";

export { useCustomColumnDefs } from "./internal/use-custom-column-defs";
export type { CustomColumnDefsController } from "./internal/use-custom-column-defs";
export {
  useCustomColumnValues,
  useSetCustomColumnValue,
} from "./internal/use-custom-column-values";
export type { CustomColumnValueIndex } from "./internal/use-custom-column-values";
export { CustomColumnsFields } from "./components/data-view-settings-button";

export default {
  description:
    "User-defined custom columns for any DataView: the config-backed definition controller, the per-row values live hook + upsert mutation, and the toolbar settings (Fields) button.",
  // custom-columns now imports data-view's barrel (a legal child→parent edge) and
  // contributes itself both ways: (1) the per-row FieldDef[] via the global
  // field-extension slot, and (2) the "Fields" UI as a global-scope Setting. The
  // host names neither — full collection-consumer separation.
  contributions: [
    DataViewSlots.FieldExtension({
      id: "custom-columns",
      // The user's own columns are their own band, wherever they are added: on a
      // schema with sections they read as one more source, and on a plain one
      // the two headings ("Common" / "Custom") are the first thing that tells
      // the app's fields apart from the ones you made.
      section: "Custom",
      component: CustomColumnFieldExtension,
    }),
    DataViewSlots.Setting({
      id: "custom-columns",
      scope: "global",
      component: CustomColumnsFieldsSetting,
    }),
  ],
} satisfies PluginDefinition;
