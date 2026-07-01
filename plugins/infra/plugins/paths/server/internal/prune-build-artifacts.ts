import { readdirSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { worktreeDataDir } from "../../core/internal/paths";

/**
 * How many recent per-build artifact *sets* to retain per worktree. A "set" is all
 * files sharing one build id: `build-profile-<id>.json`, `build-logs-<id>.json`,
 * and `build-<id>.log`.
 *
 * Aligned with the build-history UI window (buildHistoryResource keeps the latest
 * 50 runs) so every build still listed there keeps its profile/logs readable, while
 * older builds are pruned to bound disk. Kept as a plain literal — `paths` is a leaf
 * and must not import the `build` plugin — so this is a documented soft alignment,
 * not a hard coupling: drifting from 50 only makes the oldest few history rows show
 * an empty (never a broken) profile/log, since every reader fails soft on ENOENT.
 */
export const BUILD_ARTIFACTS_RETENTION = 50;

// Id-keyed build-artifact filename families (mirror of worktreeArtifacts): each maps
// a filename to its build id by stripping a fixed prefix + suffix. The un-suffixed
// "latest" aliases (`build-profile.json`, `build-logs.json`, `build.log`) match NONE
// of these (their tail is `profile.json` / `logs.json` / `build.log`, not `build-…`),
// so they are structurally excluded from pruning. The families are disjoint: the
// `.log` family cannot swallow the two `.json` families, and vice-versa.
const ID_PATTERNS: ReadonlyArray<{ prefix: string; suffix: string }> = [
  { prefix: "build-profile-", suffix: ".json" },
  { prefix: "build-logs-", suffix: ".json" },
  { prefix: "build-", suffix: ".log" },
];

/** The build id a per-build artifact filename belongs to, or null if it is not one. */
function buildIdOf(filename: string): string | null {
  for (const { prefix, suffix } of ID_PATTERNS) {
    if (
      filename.length > prefix.length + suffix.length &&
      filename.startsWith(prefix) &&
      filename.endsWith(suffix)
    ) {
      const id = filename.slice(prefix.length, filename.length - suffix.length);
      if (id) return id;
    }
  }
  return null;
}

/** A `<path>.tmp.<pid>` leftover from a crashed atomic build-artifact write. */
function isCrashedWriteTemp(filename: string): boolean {
  return (
    filename.includes(".tmp.") &&
    (filename.startsWith("build-") || filename.startsWith("build."))
  );
}

/**
 * Cap the per-build artifacts in one worktree's data dir to the newest `keep` build
 * ids, deleting the older sets, and sweep any crashed-write `.tmp.<pid>` leftovers.
 *
 * Called by every build-artifact writer immediately AFTER it writes (see the CLI's
 * writeBuildLogs/writeBuildProfile and run-build's orphan fallback), so writing a
 * new set is what trims the old ones — no scheduler, no polling. Builds are
 * serialized per namespace by the DB in-flight lock, so at prune time the only
 * writer for this dir is the just-finished build whose files carry the newest
 * mtime; they are therefore always inside the keep window and never at risk.
 *
 * Fails soft on the races inherent to concurrent readers (a file vanishing mid-scan
 * → skip) but loud on any other fs error, so a real problem still surfaces.
 */
export function pruneWorktreeBuildArtifacts(
  name: string,
  keep: number = BUILD_ARTIFACTS_RETENTION,
): void {
  pruneBuildArtifactsInDir(worktreeDataDir(name), keep);
}

/**
 * Directory-scoped core of {@link pruneWorktreeBuildArtifacts}, split out so it is
 * testable against a throwaway dir without touching the real registry layout. The
 * public wrapper owns only the name→dir resolution.
 */
export function pruneBuildArtifactsInDir(dir: string, keep: number): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
    throw err;
  }

  const unlinkQuiet = (entry: string): void => {
    try {
      unlinkSync(join(dir, entry));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  };

  // Group id-keyed files by build id; a group's recency is the newest mtime among
  // its files (profile/logs/log can be written microseconds apart).
  const groups = new Map<string, { files: string[]; mtimeMs: number }>();
  for (const entry of entries) {
    if (isCrashedWriteTemp(entry)) {
      unlinkQuiet(entry);
      continue;
    }
    const id = buildIdOf(entry);
    if (!id) continue;
    let mtimeMs: number;
    try {
      mtimeMs = statSync(join(dir, entry)).mtimeMs;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw err;
    }
    const group = groups.get(id) ?? { files: [], mtimeMs: 0 };
    group.files.push(entry);
    group.mtimeMs = Math.max(group.mtimeMs, mtimeMs);
    groups.set(id, group);
  }

  if (groups.size <= keep) return;
  const stale = [...groups.values()].sort((a, b) => b.mtimeMs - a.mtimeMs).slice(keep);
  for (const group of stale) {
    for (const entry of group.files) unlinkQuiet(entry);
  }
}
