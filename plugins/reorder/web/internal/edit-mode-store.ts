import { useSyncExternalStore } from "react";

let editMode = false;
const listeners = new Set<() => void>();

export function setEditMode(value: boolean): void {
  if (editMode === value) return;
  editMode = value;
  for (const l of listeners) l();
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
