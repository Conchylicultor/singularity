import { GIT } from "@plugins/infra/plugins/paths/server";
import {
  spawnCaptured,
  spawnExpectOk,
} from "@plugins/infra/plugins/spawn/core";
import { DIRTY_WORKTREE_REASON } from "../../core";
import type { Staleness } from "../../core";

/** What source state a release was cut from. Both fields go into `RELEASE.json`. */
export interface GitProvenance {
  /** `git rev-parse HEAD` at the instant the release started. */
  commitSha: string;
  /**
   * `git status --porcelain` was non-empty — INCLUDING untracked files, because
   * vite builds untracked files into the dist, so an untracked file is part of
   * the artifact just as much as a modified tracked one.
   */
  commitDirty: boolean;
}

async function git(args: string[], cwd: string): Promise<string> {
  const { stdout } = await spawnExpectOk([
    GIT,
    "--no-optional-locks",
    "-C",
    cwd,
    ...args,
  ]);
  return stdout;
}

/**
 * Read the source state a release is about to be cut from.
 *
 * Must be called BEFORE the artifact phase: the `build --hermetic` child it
 * shells into writes generated files into the checkout, so a dirty read taken
 * after it would report every release as dirty and say nothing about what the
 * human left in the tree.
 *
 * Throws (via `spawnExpectOk`) when git fails: a release runs from a full dev
 * checkout by construction, so "this is not a git repository" is a broken
 * premise, not a state to encode.
 */
export async function readGitProvenance(cwd: string): Promise<GitProvenance> {
  const commitSha = (await git(["rev-parse", "HEAD"], cwd)).trim();
  // `--untracked-files=normal` is git's default, spelled out so a repo- or
  // user-level `status.showUntrackedFiles=no` cannot silently make a dirty tree
  // read as clean.
  const status = await git(
    ["status", "--porcelain", "--untracked-files=normal"],
    cwd,
  );
  return { commitSha, commitDirty: status.trim().length > 0 };
}

/**
 * How a bundle's recorded provenance relates to this repository's `HEAD`.
 *
 * The rules, in the order they are applied:
 *
 * 1. **Dirty ⇒ always `unknown`.** The sha names the bundle's PARENT commit, not
 *    its bytes, so no comparison against it can prove anything. Never `current`.
 * 2. **No sha ⇒ `unknown`.** A bundle cut before provenance was recorded.
 * 3. **A sha this repo has never seen ⇒ `unknown`, not a throw.** A run dir can
 *    outlive the branch it was built from, or come from another clone.
 * 4. Ancestor of HEAD ⇒ `behind` with the true commit distance;
 *    otherwise ⇒ `diverged`.
 */
export async function compareToHead(
  provenance: { commitSha?: string | null; commitDirty?: boolean | null },
  cwd: string,
): Promise<Staleness> {
  if (provenance.commitDirty === true) {
    return { kind: "unknown", reason: DIRTY_WORKTREE_REASON };
  }
  const sha = provenance.commitSha;
  if (sha == null || sha.length === 0) {
    return {
      kind: "unknown",
      reason:
        "this release recorded no commit — it was cut before provenance existed",
    };
  }

  const known = await spawnCaptured([
    GIT,
    "--no-optional-locks",
    "-C",
    cwd,
    "cat-file",
    "-e",
    `${sha}^{commit}`,
  ]);
  if (known.exitCode !== 0) {
    return {
      kind: "unknown",
      reason: `commit ${sha} is not known to this repository`,
    };
  }

  const head = (await git(["rev-parse", "HEAD"], cwd)).trim();
  if (head === sha) return { kind: "current" };

  const isAncestor = await spawnCaptured([
    GIT,
    "--no-optional-locks",
    "-C",
    cwd,
    "merge-base",
    "--is-ancestor",
    sha,
    "HEAD",
  ]);
  if (isAncestor.exitCode !== 0) return { kind: "diverged", sha };

  const count = (
    await git(["rev-list", "--count", `${sha}..HEAD`], cwd)
  ).trim();
  return { kind: "behind", commits: Number(count) };
}
