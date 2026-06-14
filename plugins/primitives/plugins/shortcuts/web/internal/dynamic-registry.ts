import { useSyncExternalStore } from "react";
import type { ShortcutDescriptor } from "./types";

// Page-global registry of DYNAMIC shortcut registrations. A page-global registry
// of *registrations* is fine here: it is not per-surface STATE — each
// registration already carries its own `surfaceId`. This mirrors the static slot
// registry, just resolved at runtime so surface-scoped shortcuts (which need
// React context to learn their surface) can register from inside their subtree.
const registrations = new Set<ShortcutDescriptor[]>();
const listeners = new Set<() => void>();

// Memoized snapshot so useSyncExternalStore's getSnapshot stays referentially
// stable between notifications (re-derived only when a registration changes).
let snapshot: ShortcutDescriptor[] = [];

function recompute(): void {
  const next: ShortcutDescriptor[] = [];
  for (const r of registrations) next.push(...r);
  snapshot = next;
}

function emit(): void {
  recompute();
  for (const l of listeners) l();
}

/** Register a set of dynamic shortcuts. Returns an unregister callback. */
export function registerShortcuts(descriptors: ShortcutDescriptor[]): () => void {
  registrations.add(descriptors);
  emit();
  return () => {
    registrations.delete(descriptors);
    emit();
  };
}

/** Live list of all dynamically-registered shortcuts. */
export function useDynamicShortcuts(): ShortcutDescriptor[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => snapshot,
    () => snapshot,
  );
}
