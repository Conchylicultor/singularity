import { resolve } from "node:path";
import { defineGuard } from "../define-guard";
import { parseShell } from "../parse-shell";
import type { BashInput } from "../types";

const DEST_LAST_CMDS = new Set(["cp", "mv", "rsync", "install"]);
const ALL_ARGS_CMDS = new Set([
  "rm",
  "rmdir",
  "tee",
  "touch",
  "mkdir",
  "chmod",
  "chown",
  "chgrp",
  "truncate",
  "shred",
  "ln",
  "unlink",
]);
const INPLACE_FLAG_CMDS = new Set(["sed", "perl"]);
const GIT_MUTATING_SUBCMDS = new Set([
  "rm",
  "add",
  "commit",
  "reset",
  "checkout",
  "restore",
  "stash",
  "clean",
  "revert",
  "cherry-pick",
  "merge",
  "rebase",
  "push",
]);

export const mainWritesGuard = defineGuard<BashInput>({
  name: "main-writes",
  matcher: "Bash",
  bypassToken: ".allow-main",
  check(input, ctx) {
    if (!ctx.cwd.includes("/worktrees/")) return null;
    const cmd = input.command;
    if (!cmd) return null;

    const repo = resolve(ctx.cwd, "../../..");
    if (!cmd.includes(repo)) return null;

    const isMainBranch = (p: string) =>
      p.startsWith(`${repo}/`) && !p.startsWith(`${ctx.cwd}/`);

    const { calls, redirections } = parseShell(cmd);

    for (const r of redirections) {
      if (isMainBranch(r.target)) {
        return violation(`redirection target '${r.target}'`, repo, ctx.cwd);
      }
    }

    const cdsToMain = calls.some(
      (c) =>
        c.name === "cd" &&
        c.args.some((a) => {
          const resolved = resolve(a);
          return resolved === repo || resolved.startsWith(`${repo}/`);
        }),
    );
    if (cdsToMain) {
      for (const call of calls) {
        const subcmd = call.args[0];
        if (call.name === "git" && subcmd && GIT_MUTATING_SUBCMDS.has(subcmd)) {
          return violation(
            `git ${subcmd} after cd into main repo`,
            repo,
            ctx.cwd,
          );
        }
      }
    }

    for (const call of calls) {
      const paths = call.args.filter((a) => !a.startsWith("-"));

      if (DEST_LAST_CMDS.has(call.name)) {
        const dest = paths[paths.length - 1];
        if (paths.length >= 2 && dest && isMainBranch(dest)) {
          return violation(
            `${call.name} destination '${dest}'`,
            repo,
            ctx.cwd,
          );
        }
      } else if (ALL_ARGS_CMDS.has(call.name)) {
        for (const p of paths) {
          if (isMainBranch(p)) {
            return violation(`${call.name} target '${p}'`, repo, ctx.cwd);
          }
        }
      } else if (INPLACE_FLAG_CMDS.has(call.name)) {
        const hasInplace = call.args.some(
          (a) => a === "-i" || a.startsWith("-i"),
        );
        if (hasInplace) {
          for (const p of paths) {
            if (isMainBranch(p)) {
              return violation(
                `${call.name} -i target '${p}'`,
                repo,
                ctx.cwd,
              );
            }
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
