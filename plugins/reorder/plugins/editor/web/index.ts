import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { ReorderEditor } from "./internal/reorder-editor";
export {
  ReorderAreaContext,
  SortableReorderItem,
  SpacerReorderItem,
  RestoreButton,
  type ReorderAreaCtxValue,
} from "./internal/items";
export type {
  ReorderEntry,
  ReorderItemEntry,
  ReorderNodeEntry,
  ReorderEditorProps,
} from "./internal/types";

export default {
  description:
    "Presentational drag-and-drop reorder editor: sortable items, hide/restore, spacers, optional grouping zones. Display-only — no config_v2, catalog, or tree-format knowledge.",
  contributions: [],
} satisfies PluginDefinition;
