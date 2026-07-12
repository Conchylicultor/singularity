import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export {
  useUndoableTrash,
  type UndoableTrash,
  type UndoableTrashArgs,
} from "./internal/use-undoable-trash";

export default {
  description:
    "Web seam of the trash primitive: useUndoableTrash() runs a trashing mutation and records ONE entry on the tab's undo stack (undo = restore the minted trash entry, redo = re-trash and re-capture the new entry id), so every trash source gets Cmd+Z restore without hand-rolling it.",
  contributions: [],
} satisfies PluginDefinition;
