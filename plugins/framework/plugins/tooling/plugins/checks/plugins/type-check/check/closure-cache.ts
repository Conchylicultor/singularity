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

// Global (not per-worktree) + content-keyed on the dependency-closure
// fingerprint: a fresh worktree (or push at the same tree) can reuse PASSes
// recorded by a sibling worktree for files with an identical import closure.
const CACHE_DIR = join(SINGULARITY_DIR, "closure-cache");

// Pruning bounds — keep the dir from growing unbounded across weeks of trees.
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
// Entries are per-file (≈2k per tree) rather than per-check, so the caps are an
// order of magnitude above check-cache.ts to retain several trees' worth of
// PASSes for cross-worktree sharing before trimming the oldest.
const MAX_ENTRIES = 50000;
const TRIM_TO = 40000;

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

function entryFile(relPath: string, fingerprint: string): string {
  // The fingerprint already subsumes tree + config state, so no checkId/treeHash.
  return join(CACHE_DIR, `${sha256(`${relPath}:${fingerprint}`)}.json`);
}

export interface ClosureCache {
  /** True iff a PASS was recorded for this (file, closure fingerprint). */
  has(relPath: string, fingerprint: string): boolean;
  /** Record a PASS. Atomic (write-then-rename). */
  record(relPath: string, fingerprint: string): void;
}

/** Open (and lazily create) the global closure-cache. */
export function openClosureCache(): ClosureCache {
  // ~/.singularity already hosts secrets/attachments; creating a subdir is safe.
  // A genuinely unwritable home is a real fault and should surface loudly.
  mkdirSync(CACHE_DIR, { recursive: true });
  prune();
  return {
    has(relPath, fingerprint) {
      return existsSync(entryFile(relPath, fingerprint));
    },
    record(relPath, fingerprint) {
      const file = entryFile(relPath, fingerprint);
      const tmp = join(CACHE_DIR, `.${sha256(file).slice(0, 12)}.tmp`);
      writeFileSync(
        tmp,
        JSON.stringify({ relPath, fingerprint, recordedAt: Date.now() }),
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
