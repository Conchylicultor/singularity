import { resolve } from "node:path";
import { defineGuard } from "../define-guard";
import { parseShell } from "../parse-shell";
import type { ShellCall } from "../parse-shell";
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

/**
 * The directory a `git` call mutates: its effective cwd, unless an explicit
 * `-C <dir>` redirects it. git always touches the repo containing this dir,
 * regardless of any path args.
 */
function gitDir(call: ShellCall): string {
  const i = call.args.indexOf("-C");
  const target = i !== -1 ? call.args[i + 1] : undefined;
  return target ? resolve(call.cwd, target) : call.cwd;
}

/**
 * Every filesystem path a single call would write to, already resolved against
 * the call's effective working directory (so a leading `cd` is honored). Empty
 * when the call writes nothing we police.
 */
function writeTargets(call: ShellCall): string[] {
  const nonFlag = call.args.filter((a) => !a.startsWith("-"));
  const resolveAll = (ps: string[]) => ps.map((p) => resolve(call.cwd, p));

  if (DEST_LAST_CMDS.has(call.name)) {
    // cp/mv/rsync/install only write their last positional (the destination).
    const dest = nonFlag[nonFlag.length - 1];
    return nonFlag.length >= 2 && dest ? resolveAll([dest]) : [];
  }
  if (ALL_ARGS_CMDS.has(call.name)) return resolveAll(nonFlag);
  if (INPLACE_FLAG_CMDS.has(call.name)) {
    const hasInplace = call.args.some((a) => a === "-i" || a.startsWith("-i"));
    return hasInplace ? resolveAll(nonFlag) : [];
  }
  if (call.name === "git") {
    // Skip a leading `-C <dir>` global option to reach the subcommand.
    const subcmd = call.args[0] === "-C" ? call.args[2] : call.args[0];
    return subcmd && GIT_MUTATING_SUBCMDS.has(subcmd) ? [gitDir(call)] : [];
  }
  return [];
}

export const mainWritesGuard = defineGuard<BashInput>({
  name: "main-writes",
  matcher: "Bash",
  bypassToken: ".allow-main",
  check(input, ctx) {
    if (!ctx.cwd.includes("/worktrees/")) return null;
    const cmd = input.command;
    if (!cmd) return null;

    const repo = resolve(ctx.cwd, "../../..");

    // A resolved, absolute path that lands inside the repo root but outside the
    // agent's own worktree IS a write to main. Relative args are resolved
    // against each call's effective cwd before reaching here.
    const isMainBranch = (p: string) =>
      (p === repo || p.startsWith(`${repo}/`)) &&
      p !== ctx.cwd &&
      !p.startsWith(`${ctx.cwd}/`);

    for (const call of parseShell(cmd, ctx.cwd).calls) {
      for (const r of call.redirections) {
        const target = resolve(call.cwd, r.target);
        if (isMainBranch(target)) {
          return violation(`redirection target '${r.target}'`, repo, ctx.cwd);
        }
      }
      for (const target of writeTargets(call)) {
        if (isMainBranch(target)) {
          return violation(`${call.name} target '${target}'`, repo, ctx.cwd);
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
