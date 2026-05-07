import { defineGuard } from "../define-guard";
import { parseShell } from "../parse-shell";
import type { BashInput } from "../types";

export const findGuard = defineGuard<BashInput>({
  name: "find",
  matcher: "Bash",
  check(input) {
    const cmd = input.command;
    if (!cmd) return null;
    const { calls } = parseShell(cmd);
    const find = calls.find((c) => c.name === "find");
    if (!find) return null;
    if (find.args.includes("-prune") || find.args.includes("-maxdepth")) return null;
    return {
      blocked:
        "On this machine `find` is rerouted by Claude Code's shell shim to a bundled bfs that holds an unbounded directory FD frontier.",
      why: "Broad finds against trees with node_modules / worktrees accumulate ~65k DIR FDs and have crashed macOS.",
      hint: "Prefer `rg --files -g '<glob>'` (or `fd '<regex>'`) — they are faster, respect .gitignore, and have bounded FDs. If you genuinely need find's predicates (-mtime/-size/-perm/etc.), scope with -prune (e.g. `find . \\( -name node_modules -o -name .git -o -name .claude \\) -prune -o -name '*.ts' -print`) or -maxdepth N.",
    };
  },
});
