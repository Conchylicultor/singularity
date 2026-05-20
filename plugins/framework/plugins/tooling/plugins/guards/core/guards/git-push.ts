import { defineGuard } from "../define-guard";
import { parseShell } from "../parse-shell";
import type { BashInput } from "../types";

export const gitPushGuard = defineGuard<BashInput>({
  name: "git-push",
  matcher: "Bash",
  check(input) {
    const cmd = input.command;
    if (!cmd) return null;

    const { calls } = parseShell(cmd);
    const gitPush = calls.find(
      (c) => c.name === "git" && c.args[0] === "push",
    );
    if (!gitPush) return null;

    return {
      blocked: "`git push` is not allowed — agents must use the Singularity CLI.",
      why: "Raw git push bypasses validation checks, worktree-merge flow, and branch protection. A previous agent ran `git push origin main` directly and corrupted shared state.",
      hint: "Use `./singularity push -m \"commit message\"` instead. It runs checks, commits, and pushes via the proper worktree-merge flow.",
    };
  },
});
