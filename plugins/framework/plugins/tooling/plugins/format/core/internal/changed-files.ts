// The changed-file set, computed ONCE and shared by every consumer: the build's
// format pass, `./singularity format`, and the `format-clean` check. If the
// writer and the checker computed different sets, the build would format one
// set and the check would assert another.
//
// Idiom ported from
// `plugins/conversations/plugins/conversation-view/plugins/code/server/internal/compute-edited-files.ts`,
// over `spawnCaptured` (raw `Bun.spawn` is lint-banned, and `git-read-cache` is
// server-only so it is unreachable from here).

import { existsSync } from "fs";
import { join } from "path";
import { spawnCaptured } from "@plugins/infra/plugins/spawn/core";
import { COUPLED_FORMAT_SETS, isFormattable } from "./prettier";

async function git(root: string, args: string[]): Promise<string> {
  const result = await spawnCaptured(["git", ...args], { cwd: root });
  if (result.exitCode !== 0) {
    throw new Error(
      `git ${args.join(" ")} failed in ${root} (exit ${result.exitCode}): ${result.stderr.trim()}`,
    );
  }
  return result.stdout;
}

/** Split a `-z` (NUL-separated) git output into its records, dropping the trailing empty. */
function splitNul(out: string): string[] {
  return out.split("\0").filter((s) => s.length > 0);
}

/**
 * Paths changed in the working tree, from `git status --porcelain -z`.
 *
 * Each record is `XY <path>`; for a rename/copy (`R`/`C`) the ORIGIN path
 * follows as its own NUL-terminated record and must be consumed, not read as a
 * changed path. Working-tree deletions are dropped — they have no bytes to
 * format, and the reader would ENOENT on them.
 */
function parseStatusZ(out: string): string[] {
  const records = out.split("\0");
  const paths: string[] = [];
  for (let i = 0; i < records.length; i++) {
    const rec = records[i]!;
    if (rec.length === 0) continue;
    const x = rec[0]!;
    const y = rec[1]!;
    const path = rec.slice(3);
    // A rename/copy record is followed by its origin path; skip that record.
    if (x === "R" || x === "C" || y === "R" || y === "C") i++;
    const goneFromWorkingTree = y === "D" || (x === "D" && y === " ");
    if (!goneFromWorkingTree && path.length > 0) paths.push(path);
  }
  return paths;
}

/**
 * Expand each coupled set that the changed set touches to ALL of its members.
 *
 * A member that no longer exists on disk is dropped: the set's membership is
 * owned by `class-token-walk-in-sync`, which fails loudly on exactly that
 * drift — formatting must not ENOENT-crash the build ahead of the check that
 * can actually explain it.
 */
function expandCoupledSets(root: string, files: Set<string>): void {
  for (const set of COUPLED_FORMAT_SETS) {
    if (!set.some((member) => files.has(member))) continue;
    for (const member of set) {
      if (existsSync(join(root, member))) files.add(member);
    }
  }
}

/**
 * Formattable files changed vs `merge-base(HEAD, main)`, plus dirty and
 * untracked working-tree files, sorted.
 *
 * On `main`, `merge-base(HEAD, main) === HEAD`, so the set is just the dirty and
 * untracked files. That is correct: main is formatted inductively, because every
 * branch formats its own diff before landing.
 */
export async function listChangedFormattableFiles(
  root: string,
): Promise<string[]> {
  // A git failure here must NOT be conflated with "no merge-base": a
  // manufactured fallback ref (or an absorbed empty diff) would silently format
  // nothing and let `format-clean` fail later with no explanation.
  const base = (await git(root, ["merge-base", "HEAD", "main"])).trim();
  if (base.length === 0) {
    throw new Error(`git merge-base HEAD main produced no sha in ${root}`);
  }

  const files = new Set<string>();

  // -M resolves renames to the new path; --diff-filter=ACMR excludes deletions.
  const diff = await git(root, [
    "diff",
    "-M",
    "-z",
    "--name-only",
    "--diff-filter=ACMR",
    base,
  ]);
  for (const path of splitNul(diff)) files.add(path);

  // An agent's brand-new `.tsx` is invisible to the diff above. `git status`
  // honors `.gitignore`, so `node_modules/` and `dist/` are excluded for free.
  const status = await git(root, [
    "status",
    "--porcelain",
    "-z",
    "--untracked-files=all",
  ]);
  for (const path of parseStatusZ(status)) files.add(path);

  expandCoupledSets(root, files);

  return [...files].filter(isFormattable).sort();
}
