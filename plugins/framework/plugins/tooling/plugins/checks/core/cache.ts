import { createHash } from "crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "fs";
import { join } from "path";
import { SINGULARITY_DIR } from "@plugins/infra/plugins/paths/core";

// Global (not per-worktree) + content-keyed: the main-worktree auto-build can
// reuse passes recorded by an agent worktree for the identical (ff-merged) tree.
const CACHE_DIR = join(SINGULARITY_DIR, "check-cache");

// Pruning bounds — keep the dir from growing unbounded across weeks of trees.
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 5000;
const TRIM_TO = 4000;

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

function entryFile(checkId: string, treeHash: string, sig: string): string {
  const key = `${treeHash}:${checkId}:${sha256(sig)}`;
  return join(CACHE_DIR, `${sha256(key)}.json`);
}

export interface CheckCache {
  /** True iff a PASS was recorded for this (check, tree, sig). */
  has(checkId: string, treeHash: string, sig: string): boolean;
  /** Record a PASS. Atomic (write-then-rename). */
  record(checkId: string, treeHash: string, sig: string): void;
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
  };
}

// Opportunistic pruning: age-out stale entries, then cap total count. Cheap
// stat-based pass; tolerates the readdir/stat race (a concurrent writer may
// delete an entry between listing and stat).
function prune(): void {
  const names = readdirSync(CACHE_DIR).filter((n) => n.endsWith(".json"));
  const now = Date.now();
  const live: { path: string; mtimeMs: number }[] = [];
  for (const name of names) {
    const path = join(CACHE_DIR, name);
    let mtimeMs: number;
    try {
      mtimeMs = statSync(path).mtimeMs;
    } catch {
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
