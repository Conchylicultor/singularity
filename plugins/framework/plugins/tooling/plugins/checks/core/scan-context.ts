import { AsyncLocalStorage } from "node:async_hooks";

// The git tree-ish the cache key was computed from, made ambient for the
// duration of a single check.run() so any source scanner (grepCode) inspects
// EXACTLY the content the cache key represents — closing the gap where
// computeTreeHash includes untracked files (via `add -A`) but a working-tree
// `git grep` does not, which let a PASS be recorded for content never scanned.
const store = new AsyncLocalStorage<{ tree: string }>();

/** Run `fn` with `tree` as the ambient scan target. `null` → no target (run scans the working tree, uncached). */
export function withScanTree<T>(tree: string | null, fn: () => Promise<T>): Promise<T> {
  return tree ? store.run({ tree }, fn) : fn();
}

/** The tree-ish the current check should scan, or null to fall back to the working tree. */
export function currentScanTree(): string | null {
  return store.getStore()?.tree ?? null;
}
