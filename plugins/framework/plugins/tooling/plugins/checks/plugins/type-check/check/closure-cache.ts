import { createHash } from "crypto";
import {
  existsSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "fs";
import { closureCacheDir } from "../data-dirs";

// Global (not per-worktree) + content-keyed on the dependency-closure
// fingerprint: a fresh worktree (or push at the same tree) can reuse PASSes
// recorded by a sibling worktree for files with an identical import closure.
// The directory itself is declared in this plugin's `data-dirs/index.ts`.

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
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 200000;
const TRIM_TO = 160000;
// How often the age sweep is allowed to run. `prune()` is called eagerly on every
// open, and its per-entry `statSync` pass costs ~760 ms at 50k entries (~3.2 s at
// MAX_ENTRIES) — the readdir itself is only ~40 ms, so ~95% of the cost is the
// stat pass. Against a 14-day age bound an hourly sweep is plenty, so the common
// path stops after the readdir. See `prune()`.
const PRUNE_INTERVAL_MS = 60 * 60 * 1000;
const MARKER_FILE = ".last-prune";

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

function entryFile(relPath: string, fingerprint: string): string {
  // The fingerprint already subsumes tree + config state, so no checkId/treeHash.
  return closureCacheDir.file(`${sha256(`${relPath}:${fingerprint}`)}.json`);
}

export interface ClosureCache {
  /** True iff a PASS was recorded for this (file, closure fingerprint). */
  has(relPath: string, fingerprint: string): boolean;
  /** Record a PASS. Atomic (write-then-rename). */
  record(relPath: string, fingerprint: string): void;
}

/** Open (and lazily create) the global closure-cache. */
export function openClosureCache(): ClosureCache {
  // A genuinely unwritable home is a real fault and should surface loudly.
  closureCacheDir.ensure();
  prune();
  return {
    has(relPath, fingerprint) {
      return existsSync(entryFile(relPath, fingerprint));
    },
    record(relPath, fingerprint) {
      const file = entryFile(relPath, fingerprint);
      const tmp = closureCacheDir.file(`.${sha256(file).slice(0, 12)}.tmp`);
      writeFileSync(
        tmp,
        JSON.stringify({ relPath, fingerprint, recordedAt: Date.now() }),
      );
      renameSync(tmp, file); // atomic on the same filesystem
    },
  };
}

// True iff the age sweep is due (marker absent or older than the interval). The
// marker is `.last-prune`, which does not end in `.json` and so is never itself
// listed as an entry.
function ageSweepDue(now: number): boolean {
  try {
    return (
      now - statSync(closureCacheDir.file(MARKER_FILE)).mtimeMs >
      PRUNE_INTERVAL_MS
    );
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    return true; // never swept
  }
}

// Opportunistic pruning: age-out stale entries, then cap total count. Cheap
// stat-based pass; tolerates the readdir/stat race (a concurrent writer may
// delete an entry between listing and stat).
//
// The readdir is cheap but the per-entry stat pass is not, so the sweep runs only
// when it can actually do something: either the count backstop is genuinely
// breached (checked straight off the readdir, so it still triggers the instant it
// must) or the hourly age sweep is due. Both bounds are preserved exactly; only
// the cadence of the age sweep changes.
function prune(): void {
  const names = readdirSync(closureCacheDir.path).filter((n) =>
    n.endsWith(".json"),
  );
  const now = Date.now();
  if (names.length <= MAX_ENTRIES && !ageSweepDue(now)) return;
  writeFileSync(closureCacheDir.file(MARKER_FILE), "");
  const live: { path: string; mtimeMs: number }[] = [];
  for (const name of names) {
    const path = closureCacheDir.file(name);
    let mtimeMs: number;
    try {
      mtimeMs = statSync(path).mtimeMs;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      continue; // entry vanished underneath us — nothing to prune
    }
    if (now - mtimeMs > MAX_AGE_MS) {
      rmSync(path, { force: true });
    } else {
      live.push({ path, mtimeMs });
    }
  }
  if (live.length > MAX_ENTRIES) {
    live.sort((a, b) => a.mtimeMs - b.mtimeMs); // oldest first
    for (const { path } of live.slice(0, live.length - TRIM_TO)) {
      rmSync(path, { force: true });
    }
  }
}
