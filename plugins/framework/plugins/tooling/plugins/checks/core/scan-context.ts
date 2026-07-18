import { AsyncLocalStorage } from "node:async_hooks";
import type { FileSystemView } from "./read-set";

// Ambient scan context for a single check.run(). Carries:
//   - `tree`: the git tree-ish the cache key (treeHash) was computed from, so any
//     source scanner (grepCode) inspects EXACTLY the content the cache key
//     represents — closing the gap where computeTreeHash includes untracked
//     files (via `add -A`) but a working-tree `git grep` does not, which let a
//     PASS be recorded for content never scanned.
//   - `view`: the recording FileSystemView for an input-keyed check (null for a
//     legacy whole-tree-keyed check, which sets no read-set). When present, the
//     check's reads route through it so its read-set is captured. STAGE 0: no
//     check is input-keyed yet, so `view` is always null and recording never
//     fires — behaviour is identical to the old `{ tree }`-only store.
const store = new AsyncLocalStorage<{ tree: string | null; view: FileSystemView | null }>();

/**
 * Run `fn` with `tree` as the ambient scan target and `view` as the ambient
 * recording view. `tree === null` → no target (run scans the working tree,
 * uncached). `view === null` → legacy path, nothing recorded.
 */
export function withScanView<T>(
  tree: string | null,
  view: FileSystemView | null,
  fn: () => Promise<T>,
): Promise<T> {
  return tree === null && view === null ? fn() : store.run({ tree, view }, fn);
}

/** The tree-ish the current check should scan, or null to fall back to the working tree. */
export function currentScanTree(): string | null {
  const s = store.getStore();
  return s?.view?.tree ?? s?.tree ?? null;
}

/** The recording view for the current check, or null when not input-keyed. */
export function currentScanView(): FileSystemView | null {
  return store.getStore()?.view ?? null;
}
