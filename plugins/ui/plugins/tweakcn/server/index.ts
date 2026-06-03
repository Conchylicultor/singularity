import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import {
  listTweakcnThemes,
  importTweakcnTheme,
  deleteTweakcnTheme,
} from "../core/endpoints";
import { handleList } from "./internal/handle-list";
import { handleImport } from "./internal/handle-import";
import { handleDelete } from "./internal/handle-delete";

export { _tweakcnThemes } from "./internal/tables";

export default {
  name: "UI: Tweakcn",
  description:
    "Imports tweakcn themes and registers them as dynamic presets in all token groups.",
  httpRoutes: {
    [listTweakcnThemes.route]: handleList,
    [importTweakcnTheme.route]: handleImport,
    [deleteTweakcnTheme.route]: handleDelete,
  },
} satisfies ServerPluginDefinition;
