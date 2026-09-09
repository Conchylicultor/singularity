// The one enumeration of "the repo's files" for check code.
//
// Everything in the check system that reasons about the file set derives it
// from git: the cache key (`tree-hash.ts` — scratch index + `git add -A` +
// `write-tree`), the read-set snapshot (`read-set.ts` — one `git ls-tree -r`
// over that tree), and every check that hand-rolls a `git ls-files` pair. A
// check that instead WALKS the filesystem with its own deny-list answers a
// different question — it sees gitignored files the cache key does not cover —
// and so records a verdict that is not a function of its own key. That is what
// made a stray `.ts` under `.cache/scratch/` fail type-check's coverage gate
// (2026-09-09); see research/2026-09-09-tooling-check-file-enumeration-from-git.md.
//
// Call this once per run and filter the result with your own predicate.

import { spawnCaptured } from "@plugins/infra/plugins/spawn/core";

// Wedge-breaker for a metadata-only git read, not a latency budget: what these
// suffer under a saturated check run is starvation, not slowness. Same bound
// and same reasoning as `read-set.ts`'s GIT_TIMEOUT_MS.
const GIT_TIMEOUT_MS = 60_000;

async function lsFiles(root: string, args: string[]): Promise<string[]> {
  const result = await spawnCaptured(["git", "ls-files", "-z", ...args], {
    cwd: root,
    timeoutMs: GIT_TIMEOUT_MS,
  });
  if (result.exitCode !== 0) {
    // Loud, never `[]`. An absorbed failure here would tell every caller the
    // repo is empty, turning each file rule into a vacuous PASS.
    throw new Error(
      `git ls-files ${args.join(" ")} failed in ${root} (exit ${result.exitCode}): ${result.stderr.trim()}`,
    );
  }
  return result.stdout.split("\0").filter((p) => p.length > 0);
}

/**
 * Every repo-relevant path, repo-relative and sorted: tracked + untracked-not-
 * ignored, minus index entries whose file is gone from the worktree.
 *
 * This is EXACTLY the membership `computeTreeHash` folds into the check cache
 * key, so a check that enumerates through this can never record a verdict about
 * content its key does not cover.
 *
 * The `--deleted` subtraction is load-bearing, not defensive: `--cached` lists
 * index entries, so a file removed from the worktree but not yet staged is
 * still listed — while `add -A` drops it from the cache key's tree and it is
 * absent from disk. Left in, it would reach predicates that go on to read it
 * (and, for type-check, a coverage gate built from tsconfig file names read off
 * disk, which cannot own a file that is not there) — a fresh false failure on a
 * file the user just deleted.
 *
 * Throws on any git failure.
 */
export async function listRepoFiles(root: string): Promise<string[]> {
  const [present, deleted] = await Promise.all([
    lsFiles(root, ["--cached", "--others", "--exclude-standard"]),
    lsFiles(root, ["--deleted"]),
  ]);
  const gone = new Set(deleted);
  // `--cached` and `--others` are disjoint, but an unmerged path has one index
  // entry per stage — so dedupe rather than assume.
  return [...new Set(present.filter((p) => !gone.has(p)))].sort();
}
