import { defineGuard } from "../define-guard";
import { findCall } from "../parse-shell";
import type { BashInput } from "../types";

// Spellings of the shared integration ref that must never be a reset *target*.
// Deliberately excludes @{u}/@{upstream}: a worktree branch's upstream is its own
// origin/<branch>, not main, so blocking those would be a false positive.
const MAIN_REFS = new Set([
  "main",
  "origin/main",
  "origin/HEAD",
  "refs/heads/main",
  "refs/remotes/origin/main",
]);

export const gitResetMainGuard = defineGuard<BashInput>({
  name: "git-reset-main",
  matcher: "Bash",
  check(input) {
    const cmd = input.command;
    if (!cmd) return null;

    const reset = findCall(
      cmd,
      (c) => c.name === "git" && c.args[0] === "reset" && resetsBranchOntoMain(c.args),
    );
    if (!reset) return null;

    return {
      blocked: "`git reset` onto main/origin/main is not allowed.",
      why:
        "Resetting your branch onto main when main has moved past your fork point silently " +
        "stages a deletion of every commit that landed in between. A previous agent ran " +
        "`git reset --soft origin/main` and the next push reverted an entire app off main.",
      hint:
        "Main moved and you want its commits: `git stash` (if dirty) then `git rebase origin/main`. " +
        "Only squashing your own commits: `git reset --soft $(git merge-base HEAD main)` then recommit. " +
        "Never reset your branch onto main itself.",
    };
  },
});

// True only when the args move HEAD onto a main ref. A `git reset <ref> -- <paths>`
// form only restores files and never moves the branch, so it is always allowed.
function resetsBranchOntoMain(args: string[]): boolean {
  if (args.includes("--")) return false; // pathspec form — never moves HEAD
  for (let i = 1; i < args.length; i++) {
    const a = args[i]!;
    if (a.startsWith("-")) continue; // skip flags (--soft/--mixed/--hard/-q/…)
    return MAIN_REFS.has(a); // first non-flag token is the target ref
  }
  return false; // bare `git reset` → defaults to HEAD
}
