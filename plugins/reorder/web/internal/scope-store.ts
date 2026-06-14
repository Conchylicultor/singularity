import { useSyncExternalStore } from "react";

/**
 * Edit-time intent for an in-app reorder write:
 *  - `"personal"` — a per-worktree user override (`~/.singularity/config/<wt>/…`).
 *  - `"everyone"` — staged as a committed git-layer default for review.
 */
export type ReorderScope = "personal" | "everyone";

// eslint-disable-next-line scoped-store/no-module-mutable-store -- page-global by design: a single chrome toggle (Shell.Toolbar / floating bar, paired with the edit-mode pen) sets ONE reorder scope for every reorderable slot across all mounted surfaces. There is no per-surface scope, so this is intentionally global state (mirrors edit-mode-store).
let scope: ReorderScope = "personal";
const listeners = new Set<() => void>();

export function setReorderScope(value: ReorderScope): void {
  if (scope === value) return;
  scope = value;
  for (const l of listeners) l();
}

export function getReorderScope(): ReorderScope {
  return scope;
}

export function useReorderScope(): ReorderScope {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => scope,
    () => "personal",
  );
}
