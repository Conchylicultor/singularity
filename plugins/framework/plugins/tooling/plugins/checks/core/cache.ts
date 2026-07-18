import { createHash } from "crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "fs";
import { join } from "path";
import { SINGULARITY_DIR } from "@plugins/infra/plugins/paths/core";
import type { ReadSet } from "./read-set";

// Global (not per-worktree) + content-keyed: the main-worktree auto-build can
// reuse passes recorded by an agent worktree for the identical (ff-merged) tree.
const CACHE_DIR = join(SINGULARITY_DIR, "check-cache");

// Pruning bounds — keep the dir from growing unbounded across weeks of trees.
// AGE is the intended evictor; the count is only a disk backstop, so it must sit
// far above a busy day's working set. The previous 5000/4000 did not: the dir was
// measured at 4682 live entries, i.e. one busy day of agent worktrees was already
// pressing the cap, and a trim to 4000 evicts entries recorded hours earlier —
// which is exactly what makes the cross-day (and cross-worktree) reuse this cache
// exists for impossible. 4× headroom at ~4.5 KB/entry bounds the dir at ~90 MB.
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 20000;
const TRIM_TO = 16000;
// How often the age sweep is allowed to run. `prune()` is called eagerly on every
// open, and its per-entry `statSync` pass dominates the cost (~95%; the readdir
// itself is a rounding error). Against a 14-day age bound an hourly sweep is
// plenty, so the common path stops after the readdir. See `prune()`.
const PRUNE_INTERVAL_MS = 60 * 60 * 1000;
const MARKER_FILE = ".last-prune";

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

function entryFile(checkId: string, treeHash: string, sig: string): string {
  const key = `${treeHash}:${checkId}:${sha256(sig)}`;
  return join(CACHE_DIR, `${sha256(key)}.json`);
}

// Input-keyed read-set slot: a SINGLE slot per (checkId, sig) — NOT keyed on
// treeHash — holding the latest recorded read-set. Validate-by-replay
// (`read-set.ts` `validate`) checks it against a fresh snapshot, so one slot
// serves the monotonic-forward push-rebase path. Suffixed `.readset.json` so it
// still ends in `.json` and is swept by the same `prune()` as the legacy slots,
// while never colliding with a legacy `${sha256(key)}.json` name.
function readSetFile(checkId: string, sig: string): string {
  const key = `${checkId}:${sha256(sig)}`;
  return join(CACHE_DIR, `${sha256(key)}.readset.json`);
}

export interface CheckCache {
  /** True iff a PASS was recorded for this (check, tree, sig). */
  has(checkId: string, treeHash: string, sig: string): boolean;
  /** Record a PASS. Atomic (write-then-rename). */
  record(checkId: string, treeHash: string, sig: string): void;
  /**
   * Load the latest recorded read-set for (check, sig), or null if none / on any
   * read/parse error (fail-open — a corrupt slot must degrade to a cache MISS,
   * never a false HIT). Validated by `read-set.ts` `validate` before use.
   */
  loadReadSet(checkId: string, sig: string): ReadSet | null;
  /** Record (overwrite) the read-set for a PASS. Atomic (write-then-rename). */
  recordReadSet(checkId: string, sig: string, readSet: ReadSet): void;
}

/** Open (and lazily create) the global check-result cache. */
export function openCheckCache(): CheckCache {
  // ~/.singularity already hosts secrets/attachments; creating a subdir is safe.
  // A genuinely unwritable home is a real fault and should surface loudly.
  mkdirSync(CACHE_DIR, { recursive: true });
  prune();
  return {
    has(checkId, treeHash, sig) {
      return existsSync(entryFile(checkId, treeHash, sig));
    },
    record(checkId, treeHash, sig) {
      const file = entryFile(checkId, treeHash, sig);
      const tmp = join(CACHE_DIR, `.${sha256(file).slice(0, 12)}.tmp`);
      writeFileSync(
        tmp,
        JSON.stringify({ checkId, treeHash, recordedAt: Date.now() }),
      );
      renameSync(tmp, file); // atomic on the same filesystem
    },
    loadReadSet(checkId, sig) {
      const file = readSetFile(checkId, sig);
      if (!existsSync(file)) return null;
      try {
        return JSON.parse(readFileSync(file, "utf8")) as ReadSet;
      // eslint-disable-next-line promise-safety/no-bare-catch, promise-safety/no-absorbed-failure -- fail-open: a corrupt/half-written slot must degrade to a cache MISS (run the check), never a false HIT; null here means "no usable read-set", which the caller treats exactly as absent
      } catch {
        return null;
      }
    },
    recordReadSet(checkId, sig, readSet) {
      const file = readSetFile(checkId, sig);
      const tmp = join(CACHE_DIR, `.${sha256(file).slice(0, 12)}.tmp`);
      writeFileSync(tmp, JSON.stringify(readSet));
      renameSync(tmp, file); // atomic on the same filesystem
    },
  };
}

// True iff the age sweep is due (marker absent or older than the interval). The
// marker is `.last-prune`, which does not end in `.json` and so is never itself
// listed as an entry.
function ageSweepDue(now: number): boolean {
  try {
    return now - statSync(join(CACHE_DIR, MARKER_FILE)).mtimeMs > PRUNE_INTERVAL_MS;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    return true; // never swept
  }
}

// Opportunistic pruning: age-out stale entries, then cap total count. Cheap
// stat-based pass; tolerates the readdir/stat race (a concurrent writer may
// delete an entry between listing and stat). Both legacy `.json` slots and the
// input-keyed `.readset.json` slots end in `.json`, so one sweep ages/caps both.
//
// The readdir is cheap but the per-entry stat pass is not, so the sweep runs only
// when it can actually do something: either the count backstop is genuinely
// breached (checked straight off the readdir, so it still triggers the instant it
// must) or the hourly age sweep is due. Both bounds are preserved exactly; only
// the cadence of the age sweep changes.
function prune(): void {
  const names = readdirSync(CACHE_DIR).filter((n) => n.endsWith(".json"));
  const now = Date.now();
  if (names.length <= MAX_ENTRIES && !ageSweepDue(now)) return;
  writeFileSync(join(CACHE_DIR, MARKER_FILE), "");
  const live: { path: string; mtimeMs: number }[] = [];
  for (const name of names) {
    const path = join(CACHE_DIR, name);
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
