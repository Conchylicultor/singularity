import { useEffect } from "react";
import { useLatestRef } from "@plugins/primitives/plugins/latest-ref/web";
import type { PendingFlush } from "./store";
import { useUndoRedo } from "./use-undo-redo";

/**
 * Register a {@link PendingFlush} for the lifetime of this mount: registered
 * on mount, unregistered on unmount, so a producer that dies with its
 * component can never leave a dangling flush on the tab's stack. The callback
 * is read through a ref, so a new identity each render neither re-registers
 * nor moves the flush's position in the run order.
 *
 * A producer that coalesces edits into one entry (the page editor's typing
 * runs) registers the function that closes every open run; `undo()`/`redo()`
 * call it before popping, so a ⌘Z mid-run undoes that run, not the entry below.
 */
export function usePendingFlush(flush: PendingFlush): void {
  const { registerPendingFlush } = useUndoRedo();
  const latest = useLatestRef(flush);
  useEffect(
    () => registerPendingFlush(() => latest.current()),
    [registerPendingFlush, latest],
  );
}
