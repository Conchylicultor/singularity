import { parseShell } from "../parse-shell";
import type { BashInput, Guard } from "../types";

const MESSAGE =
  "On this machine `find` is rerouted by Claude Code's shell shim to a bundled bfs that holds an unbounded directory FD frontier. Broad finds against trees with node_modules / worktrees accumulate ~65k DIR FDs and have crashed macOS. Prefer `rg --files -g '<glob>'` (or `fd '<regex>'`) — they are faster, respect .gitignore, and have bounded FDs. If you genuinely need find's predicates (-mtime/-size/-perm/etc.), scope with -prune (e.g. `find . \\( -name node_modules -o -name .git -o -name .claude \\) -prune -o -name '*.ts' -print`) or -maxdepth N. If you believe this block is a false positive and the call was legitimate as written, STOP your current task immediately, report the blocked command and the context to the user, and wait for further instructions — do not retry, do not work around it, do not improvise an alternative.";

export const findGuard: Guard<BashInput> = {
  name: "find",
  matcher: "Bash",
  check(input, ctx) {
    const cmd = input.command;
    if (!cmd) return ctx.allow();
    const { calls } = parseShell(cmd);
    const find = calls.find((c) => c.name === "find");
    if (!find) return ctx.allow();
    if (find.args.includes("-prune") || find.args.includes("-maxdepth")) return ctx.allow();
    return ctx.deny(MESSAGE);
  },
};
