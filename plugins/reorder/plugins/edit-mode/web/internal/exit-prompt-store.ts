import { useSyncExternalStore } from "react";

/**
 * Module-level "show the exit Cancel/Commit popover" flag.
 *
 * Why a module store rather than a component ref: the pen button lives inside
 * the action-bar slot, which the reorder list middleware re-renders (and
 * re-parents) when edit mode toggles — so a `useRef`-based "previous edit mode"
 * tracker inside the pen button is RESET by that remount and can never observe
 * the `true → false` edge. A stable `Core.Root` observer (which never remounts
 * on edit-mode toggle) drives this flag instead; the pen-button popover only
 * READS it. Page-global by design: there is one edit mode and one pen button.
 */
// eslint-disable-next-line scoped-store/no-module-mutable-store -- page-global by design: mirrors edit-mode-store; a single pen button shows one exit popover for the one global edit mode.
let promptOpen = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

export function setExitPromptOpen(value: boolean): void {
  if (promptOpen === value) return;
  promptOpen = value;
  emit();
}

export function useExitPromptOpen(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => promptOpen,
    () => false,
  );
}
