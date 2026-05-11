import { resolve } from "node:path";
import { defineGuard } from "../define-guard";
import { parseShell } from "../parse-shell";
import type { BashInput } from "../types";

export const mainWritesGuard = defineGuard<BashInput>({
  name: "main-writes",
  matcher: "Bash",
  bypassToken: ".allow-main",
  check(input, ctx) {
    if (!ctx.cwd.includes("/worktrees/")) return null;
    const cmd = input.command;
    if (!cmd) return null;

    const repo = resolve(ctx.cwd, "../../..");
    if (!cmd.includes(`${repo}/`)) return null;

    const isMainBranch = (p: string) =>
      p.startsWith(`${repo}/`) && !p.startsWith(`${ctx.cwd}/`);

    const { calls, redirections } = parseShell(cmd);

    for (const r of redirections) {
      if (isMainBranch(r.target)) {
        return violation(`redirection target '${r.target}'`, repo, ctx.cwd);
      }
    }

    for (const call of calls) {
      const paths = call.args.filter((a) => !a.startsWith("-"));
      if (call.name === "cp" || call.name === "mv" || call.name === "rsync") {
        if (paths.length >= 2 && isMainBranch(paths[paths.length - 1])) {
          return violation(
            `${call.name} destination '${paths[paths.length - 1]}'`,
            repo,
            ctx.cwd,
          );
        }
      } else if (call.name === "tee") {
        for (const p of paths) {
          if (isMainBranch(p)) {
            return violation(`tee destination '${p}'`, repo, ctx.cwd);
          }
        }
      }
    }
    return null;
  },
});

function violation(target: string, repo: string, cwd: string) {
  return {
    blocked: `Blocked write to main branch: ${target} is under ${repo} (outside worktree ${cwd}).`,
    why: "Writing directly to the main branch from a worktree corrupts shared state — a previous agent ran `cp <worktree>/file <main>/file` and leaked uncommitted changes.",
    hint: `Write to files inside your worktree (${cwd}) instead.`,
  };
}
