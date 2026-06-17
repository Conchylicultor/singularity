import { useMemo, useRef } from "react";
import { useSurfaceShortcuts } from "@plugins/primitives/plugins/shortcuts/web";
import type { ShortcutDescriptor } from "@plugins/primitives/plugins/shortcuts/web";
import { useUndoRedo } from "./use-undo-redo";

export interface UndoRedoShortcutsOptions {
  /** Extra gate combined (AND) with canUndo/canRedo. Default: always allowed. */
  when?: () => boolean;
}

/**
 * Convenience surface-scoped key bindings for non-Lexical consumers:
 *   - undo: `mod+z`        (eligible while `canUndo` and `when()`)
 *   - redo: `mod+shift+z`  and `mod+y` (eligible while `canRedo` and `when()`)
 *
 * `enableInInputs` is on so the bindings still fire inside editable surfaces.
 *
 * The api + `when` are read through a ref so the descriptor array stays
 * referentially stable across `canUndo`/`canRedo` flips — `useSurfaceShortcuts`
 * keys its effect on the array, and a fresh array each render would
 * re-register on every keystroke. Eligibility stays live because each
 * descriptor's `when`/`handler` reads `latest.current` at call time.
 */
export function useUndoRedoShortcuts(opts?: UndoRedoShortcutsOptions): void {
  const api = useUndoRedo();

  const latest = useRef({ api, when: opts?.when });
  latest.current = { api, when: opts?.when };

  const descriptors = useMemo<Omit<ShortcutDescriptor, "surfaceId">[]>(() => {
    const gate = (): boolean => latest.current.when?.() ?? true;
    return [
      {
        id: "undo-redo:undo",
        keys: "mod+z",
        label: "Undo",
        group: "Edit",
        enableInInputs: true,
        when: () => latest.current.api.canUndo && gate(),
        handler: () => latest.current.api.undo(),
      },
      {
        id: "undo-redo:redo",
        keys: "mod+shift+z",
        label: "Redo",
        group: "Edit",
        enableInInputs: true,
        when: () => latest.current.api.canRedo && gate(),
        handler: () => latest.current.api.redo(),
      },
      {
        id: "undo-redo:redo-y",
        keys: "mod+y",
        label: "Redo",
        group: "Edit",
        enableInInputs: true,
        when: () => latest.current.api.canRedo && gate(),
        handler: () => latest.current.api.redo(),
      },
    ];
  }, []);

  useSurfaceShortcuts(descriptors);
}
