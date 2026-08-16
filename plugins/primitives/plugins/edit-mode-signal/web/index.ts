import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export {
  getEditMode,
  setEditMode,
  useEditMode,
} from "./internal/edit-mode-store";

export default {
  description:
    "The page-global edit-mode signal — setEditMode / getEditMode / useEditMode — as a leaf primitive whose only import is react. Everything that reorder's edit mode restyles (a bar, a wrapping chip row) reads the signal without importing the reorder feature plugin.",
  contributions: [],
} satisfies PluginDefinition;
