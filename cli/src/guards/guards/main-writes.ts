import { resolve } from "node:path";
import { parseShell } from "../parse-shell";
import type { BashInput, Guard } from "../types";

function message(violation: string, repo: string, cwd: string): string {
  return `Blocked write to main branch: ${violation} is under ${repo} (outside worktree ${cwd}).\n\nWriting directly to the main branch from a worktree corrupts shared state — a previous agent ran \`cp <worktree>/file <main>/file\` and leaked uncommitted changes.\n\nWrite to files inside your worktree (${cwd}) instead.\n\nIf you believe there is a legitimate reason to write outside the worktree: STOP immediately, report the blocked command and your reasoning to the user, and wait for instructions. Do NOT attempt to work around this guard (restructuring the command, using alternative tools, etc.). If the user explicitly approves, they will tell you to create $PWD/.allow-main to bypass.`;
}

export const mainWritesGuard: Guard<BashInput> = {
  name: "main-writes",
  matcher: "Bash",
  check(input, ctx) {
    if (ctx.hasBypass(".allow-main")) return ctx.allow();
    if (!ctx.cwd.includes("/worktrees/")) return ctx.allow();
    const cmd = input.command;
    if (!cmd) return ctx.allow();

    const repo = resolve(ctx.cwd, "../../..");
    if (!cmd.includes(`${repo}/`)) return ctx.allow();

    const isMainBranch = (p: string) =>
      p.startsWith(`${repo}/`) && !p.startsWith(`${ctx.cwd}/`);

    const { calls, redirections } = parseShell(cmd);

    for (const r of redirections) {
      if (isMainBranch(r.target)) {
        return ctx.deny(message(`redirection target '${r.target}'`, repo, ctx.cwd));
      }
    }

    for (const call of calls) {
      const paths = call.args.filter((a) => !a.startsWith("-"));
      if (call.name === "cp" || call.name === "mv" || call.name === "rsync") {
        if (paths.length >= 2 && isMainBranch(paths[paths.length - 1])) {
          return ctx.deny(
            message(`${call.name} destination '${paths[paths.length - 1]}'`, repo, ctx.cwd),
          );
        }
      } else if (call.name === "tee") {
        for (const p of paths) {
          if (isMainBranch(p)) {
            return ctx.deny(message(`tee destination '${p}'`, repo, ctx.cwd));
          }
        }
      }
    }
    return ctx.allow();
  },
};
