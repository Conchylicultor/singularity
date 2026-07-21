import { defineGuard } from "../define-guard";
import { findCall } from "../parse-shell";
import type { BashInput } from "../types";

export const gitPushGuard = defineGuard<BashInput>({
  name: "git-push",
  matcher: "Bash",
  // Escape hatch for when the CLI push flow itself is unavailable (e.g. the
  // 2026-07-21 op-wedge holding the push mutex): user-approved raw branch push.
  // Same contract as .allow-main / .allow-postgres — an agent may create the
  // token ONLY when the user explicitly says so, in the current conversation.
  bypassToken: ".allow-git-push",
  check(input) {
    const cmd = input.command;
    if (!cmd) return null;

    const gitPush = findCall(cmd, (c) => c.name === "git" && c.args[0] === "push");
    if (!gitPush) return null;

    return {
      blocked: "`git push` is not allowed — agents must use the Singularity CLI.",
      why: "Raw git push bypasses validation checks, worktree-merge flow, and branch protection. A previous agent ran `git push origin main` directly and corrupted shared state.",
      hint: "Use `./singularity push -m \"commit message\"` instead. It runs checks, commits, and pushes via the proper worktree-merge flow.",
    };
  },
});
