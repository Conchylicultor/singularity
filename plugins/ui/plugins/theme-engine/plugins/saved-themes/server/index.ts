import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import {
  listSavedThemes,
  createSavedTheme,
  patchSavedThemeFragment,
  patchSavedThemeColorAdjust,
  renameSavedTheme,
  deleteSavedTheme,
} from "../core";
import {
  handleList,
  handleCreate,
  handlePatchFragment,
  handlePatchColorAdjust,
  handleRename,
  handleDelete,
} from "./internal/handlers";

export { saveTheme } from "./internal/store";

export default {
  description:
    "Stores tweakcn imports and custom themes in one table, with the create / edit / rename / delete endpoints. A delete refuses while any scope still selects the theme unless asked to reassign those scopes to Default.",
  httpRoutes: {
    [listSavedThemes.route]: handleList,
    [createSavedTheme.route]: handleCreate,
    [patchSavedThemeFragment.route]: handlePatchFragment,
    [patchSavedThemeColorAdjust.route]: handlePatchColorAdjust,
    [renameSavedTheme.route]: handleRename,
    [deleteSavedTheme.route]: handleDelete,
  },
} satisfies ServerPluginDefinition;
