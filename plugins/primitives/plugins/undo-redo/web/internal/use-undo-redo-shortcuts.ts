import { useMemo } from "react";
import { useSurfaceShortcuts } from "@plugins/primitives/plugins/shortcuts/web";
import type { ShortcutDescriptor } from "@plugins/primitives/plugins/shortcuts/web";
import { useLatestRef } from "@plugins/primitives/plugins/latest-ref/web";
import { UndoRedoStore } from "./store";
import { useUndoRedo } from "./use-undo-redo";
import { resolveUndoOwner } from "./undo-owner";

export interface UndoRedoShortcutsOptions {
  /** Extra gate combined (AND) with canUndo/canRedo. Default: always allowed. */
  when?: (event: KeyboardEvent) => boolean;
}

/**
 * Convenience surface-scoped key bindings for non-Lexical consumers:
 *   - undo: `mod+z`        (eligible while `canUndo` and `when()`)
 *   - redo: `mod+shift+z`  and `mod+y` (eligible while `canRedo` and `when()`)
 *
 * `enableInInputs` is on so the bindings still fire inside editable surfaces —
 * the page body IS an editable surface. What keeps that from stealing every
 * text field's own undo is the built-in {@link resolveUndoOwner} gate: the
 * keystroke must land in a subtree that delegates to the surface stack, so a
 * ⌘Z typed in the agent prompt (a Lexical editor with its own `HistoryPlugin`)
 * undoes the prompt and nothing else.
 *
 * Undo is eligible while `canUndo` OR while any pending flush is registered:
 * the stack cannot see an entry a producer is still holding (a typing run
 * inside its coalescing window), so with a flush registered the key must reach
 * `undo()` — which seals it first — even when the recorded stack is empty.
 * Otherwise the very first typing run on a fresh page could never be undone.
 * Redo stays gated on `canRedo` alone: a flush that seals anything clears
 * `future`, so there is nothing a sealed entry could make redoable.
 *
 * The api + `when` are read through a ref so the descriptor array stays
 * referentially stable across `canUndo`/`canRedo` flips — `useSurfaceShortcuts`
 * keys its effect on the array, and a fresh array each render would
 * re-register on every keystroke. Eligibility stays live because each
 * descriptor's `when`/`handler` reads `latest.current` at call time.
 */
export function useUndoRedoShortcuts(opts?: UndoRedoShortcutsOptions): void {
  const api = useUndoRedo();
  const hasPendingFlush = UndoRedoStore.useSelector(
    (s) => s.flushes.size > 0,
    [],
  );

  const latest = useLatestRef({ api, hasPendingFlush, when: opts?.when });

  const descriptors = useMemo<Omit<ShortcutDescriptor, "surfaceId">[]>(() => {
    const gate = (event: KeyboardEvent): boolean =>
      resolveUndoOwner(event.target) === "surface" &&
      (latest.current.when?.(event) ?? true);
    return [
      {
        id: "undo-redo:undo",
        keys: "mod+z",
        label: "Undo",
        group: "Edit",
        enableInInputs: true,
        when: (event) =>
          (latest.current.api.canUndo || latest.current.hasPendingFlush) &&
          gate(event),
        handler: () => latest.current.api.undo(),
      },
      {
        id: "undo-redo:redo",
        keys: "mod+shift+z",
        label: "Redo",
        group: "Edit",
        enableInInputs: true,
        when: (event) => latest.current.api.canRedo && gate(event),
        handler: () => latest.current.api.redo(),
      },
      {
        id: "undo-redo:redo-y",
        keys: "mod+y",
        label: "Redo",
        group: "Edit",
        enableInInputs: true,
        when: (event) => latest.current.api.canRedo && gate(event),
        handler: () => latest.current.api.redo(),
      },
    ];
  }, []);

  useSurfaceShortcuts(descriptors);
}
