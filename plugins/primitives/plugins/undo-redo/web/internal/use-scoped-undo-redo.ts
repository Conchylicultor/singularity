import { useCallback, useEffect, useId, useMemo } from "react";
import type { HistoryEntry } from "./stack";
import { useUndoRedo, type UndoRedoApi } from "./use-undo-redo";

/**
 * {@link useUndoRedo} for a consumer whose thunks depend on its own live mount —
 * the per-mount store, doc, or editor they close over dies with the component,
 * so replaying one after unmount is a no-op at best and a patch dispatched into
 * the wrong host at worst.
 *
 * Same api, two differences: `record` stamps every entry with a scope derived
 * from `useId()` (stable for this mount, unique across mounts), and the unmount
 * cleanup drops that scope's entries from `past` AND `future`. The surrounding
 * history — entries recorded by other consumers of the same tab-level
 * `<UndoRedoProvider>` — is untouched.
 *
 * A consumer whose thunks are self-contained (pure server calls) uses plain
 * `useUndoRedo`: its entries are valid anywhere in the tab and rightly outlive
 * any one mount.
 */
export function useScopedUndoRedo(): UndoRedoApi {
  const api = useUndoRedo();
  const scope = useId();
  const { record: recordEntry, dropScope } = api;

  const record = useCallback(
    (entry: HistoryEntry) => recordEntry({ ...entry, scope }),
    [recordEntry, scope],
  );

  useEffect(() => () => dropScope(scope), [dropScope, scope]);

  return useMemo(() => ({ ...api, record }), [api, record]);
}
