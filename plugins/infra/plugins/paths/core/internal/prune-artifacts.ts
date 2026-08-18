import { readdirSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import type { Namespace } from "@plugins/infra/plugins/namespace/core";
import { worktreeDataDir } from "./paths";

/*
 * Lives in `core/` beside `paths.ts` — the layout it mirrors — rather than in
 * `server/`, which is where it started when every caller happened to be a server
 * plugin. The check transcript's writer is the check RUNNER, a `core`-runtime
 * module that cannot import a `server` barrel; and there is nothing server-side
 * about the code itself (`node:fs` only, same as spawn/core and file-sink/core).
 * `server/index.ts` re-exports the whole surface, so no caller changed.
 */

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

/**
 * How many recent per-release fallback logs (`release-logs-<id>.json`) to retain
 * per worktree.
 *
 * A plain disk-retention bound: keep the newest 50 per-run fallback logs per
 * worktree, pruning older ones to cap disk (same disk-bound rationale as
 * {@link BUILD_ARTIFACTS_RETENTION}). The release-history UI no longer imposes a
 * matching window — it is now a composition-scoped keyset-paginated query (no
 * 50-run cap), so an old run beyond this retention is still *listed*, it just
 * shows an empty (never a broken) persisted log if its file was pruned. Only
 * *failed* releases write a log file at all (successes stream live and persist
 * nothing), so 50 log files span many more than 50 history rows in practice. Same
 * leaf-plugin constraint: `paths` must not import `release`, and every reader
 * fails soft on ENOENT.
 */
export const RELEASE_ARTIFACTS_RETENTION = 50;

/**
 * How many recent per-run check transcripts (`check-<id>.log`) to retain per
 * worktree.
 *
 * Same disk-bound rationale as {@link BUILD_ARTIFACTS_RETENTION}, and the same
 * number on purpose: a build's checks write one of these per build, so a smaller
 * window would reap the transcript of a build whose `build-<id>.log` is still
 * there — and the build log's `Check logs:` pointer would then name a file that
 * no longer exists. Standalone `./singularity check` runs share the window, so
 * the true depth is "the last 50 check runs", not "the last 50 builds".
 */
export const CHECK_ARTIFACTS_RETENTION = 50;

/**
 * An id-keyed on-disk artifact family living in the per-worktree data dir. Each
 * family is pruned independently to its own retention window, and a prune only
 * ever sees filenames matching its OWN patterns — so keeping the newest N of one
 * family never affects another, even where two families share a run id (a build
 * and its check transcript deliberately do).
 */
interface ArtifactFamily {
  /**
   * Id-keyed filename shapes: each maps a filename to its run id by stripping a
   * fixed prefix + suffix. The un-suffixed "latest" aliases (e.g.
   * `build-profile.json`) match none of these and are structurally excluded.
   */
  readonly patterns: ReadonlyArray<{ prefix: string; suffix: string }>;
  /**
   * Filename prefixes whose `.tmp.<pid>` leftovers are this family's crashed
   * atomic-write temps, always swept regardless of retention.
   */
  readonly tmpPrefixes: ReadonlyArray<string>;
}

// Build artifacts (mirror of worktreeArtifacts): the un-suffixed aliases
// (`build-profile.json` / `build-logs.json` / `build.log`) have tails
// `profile.json` / `logs.json` / `build.log`, matching none of the patterns, so
// they are never pruned. The families are internally disjoint: the `.log` family
// cannot swallow the two `.json` families, and vice-versa.
const BUILD_FAMILY: ArtifactFamily = {
  patterns: [
    { prefix: "build-profile-", suffix: ".json" },
    { prefix: "build-logs-", suffix: ".json" },
    { prefix: "build-", suffix: ".log" },
  ],
  tmpPrefixes: ["build-", "build."],
};

// Release artifacts: a single always-id-keyed family (`release-logs-<id>.json`).
// There is no un-suffixed alias — releases only ever write per-run logs.
const RELEASE_FAMILY: ArtifactFamily = {
  patterns: [{ prefix: "release-logs-", suffix: ".json" }],
  tmpPrefixes: ["release-logs-"],
};

// Check transcripts: a single always-id-keyed family (`check-<id>.log`), where
// the id is the RUN's id (a build's buildId, a standalone check's opId). Disjoint
// from the build family by construction — `check-<id>.log` does not start with
// `build-`, and `build-<id>.log` does not start with `check-` — so neither can
// reap the other's files even though both end in `.log`.
const CHECK_FAMILY: ArtifactFamily = {
  patterns: [{ prefix: "check-", suffix: ".log" }],
  tmpPrefixes: ["check-"],
};

/** The one legacy fixed-path check transcript, reaped alongside the family below. */
const LEGACY_CHECK_LOG = "check.log";

/** The run id an id-keyed artifact filename belongs to, or null if it is not one. */
function runIdOf(
  filename: string,
  patterns: ArtifactFamily["patterns"],
): string | null {
  for (const { prefix, suffix } of patterns) {
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

/** A `<path>.tmp.<pid>` leftover from a crashed atomic write in this family. */
function isCrashedWriteTemp(
  filename: string,
  tmpPrefixes: ArtifactFamily["tmpPrefixes"],
): boolean {
  return (
    filename.includes(".tmp.") &&
    tmpPrefixes.some((p) => filename.startsWith(p))
  );
}

/**
 * Delete one entry, tolerating the races inherent to concurrent readers/writers
 * (it vanished between the scan and the unlink) but loud on any other fs error.
 */
function unlinkQuiet(dir: string, entry: string): void {
  try {
    unlinkSync(join(dir, entry));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}

/**
 * Cap one artifact family in a directory to the newest `keep` run ids, deleting the
 * older sets, and sweep any crashed-write `.tmp.<pid>` leftovers for that family.
 *
 * Called by every artifact writer immediately AFTER it writes (see the build CLI's
 * writeBuildLogs/writeBuildProfile, run-build's orphan fallback, and run-release's
 * failure fallback), so writing a new set is what trims the old ones — no
 * scheduler, no polling. Writes are serialized per namespace (the DB in-flight
 * lock), so at prune time the just-written files carry the newest mtime and are
 * always inside the keep window, never at risk.
 *
 * Fails soft on the races inherent to concurrent readers (a file vanishing mid-scan
 * → skip) but loud on any other fs error, so a real problem still surfaces.
 */
function pruneArtifactsInDir(
  dir: string,
  family: ArtifactFamily,
  keep: number,
): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
    throw err;
  }

  // Group id-keyed files by run id; a group's recency is the newest mtime among
  // its files (a build's profile/logs/log can be written microseconds apart).
  const groups = new Map<string, { files: string[]; mtimeMs: number }>();
  for (const entry of entries) {
    if (isCrashedWriteTemp(entry, family.tmpPrefixes)) {
      unlinkQuiet(dir, entry);
      continue;
    }
    const id = runIdOf(entry, family.patterns);
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
  const stale = [...groups.values()]
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(keep);
  for (const group of stale) {
    for (const entry of group.files) unlinkQuiet(dir, entry);
  }
}

/** Directory-scoped build prune, split out so it is testable against a throwaway dir. */
export function pruneBuildArtifactsInDir(dir: string, keep: number): void {
  pruneArtifactsInDir(dir, BUILD_FAMILY, keep);
}

/** Directory-scoped release prune, split out so it is testable against a throwaway dir. */
export function pruneReleaseArtifactsInDir(dir: string, keep: number): void {
  pruneArtifactsInDir(dir, RELEASE_FAMILY, keep);
}

/**
 * Directory-scoped check prune, split out so it is testable against a throwaway dir.
 *
 * Also reaps the one legacy fixed-path transcript. Before `check-<id>.log`, every
 * run wrote `check.log`, and that file is exactly the misreading this layout
 * removed: it holds whichever run last *finished*, so a reader who opens it after
 * a killed run reads a different run's failures. Leaving it beside the per-run
 * files preserves the trap. (Removable once the fleet has turned over — nothing
 * writes it any more.)
 */
export function pruneCheckArtifactsInDir(dir: string, keep: number): void {
  pruneArtifactsInDir(dir, CHECK_FAMILY, keep);
  unlinkQuiet(dir, LEGACY_CHECK_LOG);
}

/** Cap the per-build artifacts in one worktree's data dir to the newest `keep` build ids. */
export function pruneWorktreeBuildArtifacts(
  name: Namespace,
  keep: number = BUILD_ARTIFACTS_RETENTION,
): void {
  pruneBuildArtifactsInDir(worktreeDataDir(name), keep);
}

/** Cap the per-release fallback logs in one worktree's data dir to the newest `keep` release ids. */
export function pruneWorktreeReleaseArtifacts(
  name: Namespace,
  keep: number = RELEASE_ARTIFACTS_RETENTION,
): void {
  pruneReleaseArtifactsInDir(worktreeDataDir(name), keep);
}

/** Cap the per-run check transcripts in one worktree's data dir to the newest `keep` run ids. */
export function pruneWorktreeCheckArtifacts(
  name: Namespace,
  keep: number = CHECK_ARTIFACTS_RETENTION,
): void {
  pruneCheckArtifactsInDir(worktreeDataDir(name), keep);
}
