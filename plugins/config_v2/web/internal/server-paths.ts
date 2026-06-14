import { useSyncExternalStore } from "react";

// The authoritative set of storePaths the server has registered (via
// ConfigV2.Register), learned from the boot snapshot. `null` until boot
// completes — a failed boot leaves it null so reads degrade gracefully instead
// of throwing false positives. Once set, useConfig asserts membership: a
// descriptor registered on web but missing here is a half-registration that
// would otherwise silently read back defaults.
// eslint-disable-next-line scoped-store/no-module-mutable-store -- page-global by design: a server boot fact (which descriptors the server registered), identical for every mounted surface — not per-surface state.
let knownServerPaths: Set<string> | null = null;
const listeners = new Set<() => void>();

export function setKnownServerPaths(paths: string[]): void {
  knownServerPaths = new Set(paths);
  for (const l of listeners) l();
}

export function useKnownServerPaths(): Set<string> | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => knownServerPaths,
    () => knownServerPaths,
  );
}
