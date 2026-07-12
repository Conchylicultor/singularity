import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { UndoRedoProvider, type UndoRedoProviderProps } from "./internal/provider";
export { useUndoRedo, type UndoRedoApi } from "./internal/use-undo-redo";
export { useScopedUndoRedo } from "./internal/use-scoped-undo-redo";
export {
  useUndoRedoShortcuts,
  type UndoRedoShortcutsOptions,
} from "./internal/use-undo-redo-shortcuts";
export type { HistoryEntry } from "./internal/stack";

export default {
  description:
    "Surface-scoped client-side undo/redo command-history stack: a UndoRedoProvider per surface tab holding past/future stacks of {undo,redo} thunks, with time-windowed coalescing, a max-depth cap, a re-entrancy guard so replayed patches aren't re-recorded, mount-scoped entries (useScopedUndoRedo drops its entries when its mount unmounts), and an optional useUndoRedoShortcuts (mod+z / mod+shift+z / mod+y) convenience binding.",
  contributions: [],
} satisfies PluginDefinition;
