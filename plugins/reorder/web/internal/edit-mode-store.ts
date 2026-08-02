import { useSyncExternalStore } from "react";

// eslint-disable-next-line scoped-store/no-module-mutable-store -- page-global by design: a single chrome pen button (Shell.Toolbar / floating bar) toggles ONE edit mode for every reorderable slot across all mounted surfaces. There is no per-surface toggle, so this is intentionally global state.
let editMode = false;
const listeners = new Set<() => void>();

export function setEditMode(value: boolean): void {
  if (editMode === value) return;
  editMode = value;
  for (const l of listeners) l();
}

export function getEditMode(): boolean {
  return editMode;
}

export function useEditMode(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => editMode,
    () => false,
  );
}
