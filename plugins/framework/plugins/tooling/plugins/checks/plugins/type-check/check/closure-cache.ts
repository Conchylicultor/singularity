import { closureCacheDir } from "../data-dirs";
import { openPassSet, type PassSetBounds } from "./pass-set";

// Global (not per-worktree) + content-keyed on the dependency-closure
// fingerprint: a fresh worktree (or push at the same tree) can reuse PASSes
// recorded by a sibling worktree for files with an identical import closure.
// The directory itself is declared in this plugin's `data-dirs/index.ts`; the
// store mechanics (atomic write, bounds, throttled sweep) live in `./pass-set`.

// Pruning bounds — keep the dir from growing unbounded across weeks of trees.
// AGE is the intended evictor; the count is only a disk backstop. Entries are
// per-file (≈2k per tree) rather than per-check, so a single day of agent
// worktrees mints tens of thousands of them — the previous 50000/40000 was
// measured at 45684 live entries of which EVERY ONE was written that same day.
// The count bound, not the age bound, was doing all the evicting, so nothing
// survived 24h and cross-day reuse could never happen. 4× headroom at ~4.3 KB
// of allocated blocks per entry (177 B of JSON, one 4 KB block) bounds the dir
// at ~850 MB worst case; realistic churn under the 14-day age bound settles far
// below that.
const BOUNDS: PassSetBounds = {
  maxAgeMs: 14 * 24 * 60 * 60 * 1000,
  maxEntries: 200000,
  trimTo: 160000,
  pruneIntervalMs: 60 * 60 * 1000,
};

export interface ClosureCache {
  /** True iff a PASS was recorded for this (file, closure fingerprint). */
  has(relPath: string, fingerprint: string): boolean;
  /** Record a PASS. Atomic (write-then-rename). */
  record(relPath: string, fingerprint: string): void;
}

/** Open (and lazily create) the global closure-cache. */
export function openClosureCache(): ClosureCache {
  const set = openPassSet(closureCacheDir, BOUNDS);
  // The fingerprint already subsumes tree + config state, so no checkId/treeHash.
  const key = (relPath: string, fingerprint: string): string =>
    `${relPath}:${fingerprint}`;
  return {
    has: (relPath, fingerprint) => set.has(key(relPath, fingerprint)),
    record: (relPath, fingerprint) =>
      set.record(key(relPath, fingerprint), { relPath, fingerprint }),
  };
}
