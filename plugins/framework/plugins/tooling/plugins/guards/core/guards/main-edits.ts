import { resolve } from "node:path";
import { HOME_DIR } from "@plugins/infra/plugins/paths/core";
import { defineGuard } from "../define-guard";
import type { FileInput } from "../types";

export const mainEditsGuard = defineGuard<FileInput>({
  name: "main-edits",
  matcher: ["Write", "Edit", "NotebookEdit"],
  bypassToken: ".allow-main",
  check(input, ctx) {
    let f = input.file_path;
    if (!f) return null;
    if (!f.startsWith("/")) f = resolve(ctx.cwd, f);

    if (f === ctx.cwd || f.startsWith(`${ctx.cwd}/`)) return null;

    if (/^\/tmp\//.test(f)) return null;

    const memoryPrefix = `${HOME_DIR}/.claude/projects/`;
    if (f.startsWith(memoryPrefix)) {
      const rest = f.slice(memoryPrefix.length);
      const slash = rest.indexOf("/");
      if (slash !== -1 && rest.slice(slash + 1).startsWith("memory/")) {
        return null;
      }
    }

    if (f.startsWith(`${HOME_DIR}/.claude/plans/`)) {
      return {
        blocked: `Do not edit plan files directly (${f}).`,
        hint: "Use the `plan` skill instead — it writes the plan doc to the correct location.",
        skipEpilogue: true,
      };
    }

    const worktreeMarker = "/.claude/worktrees/";
    const markerIdx = ctx.cwd.indexOf(worktreeMarker);
    const repoRoot = markerIdx !== -1 ? ctx.cwd.slice(0, markerIdx) : null;
    const relPath =
      repoRoot && f.startsWith(`${repoRoot}/`) ? f.slice(repoRoot.length) : null;

    return {
      blocked: `Refusing to edit ${f} — this path is not in the allowlist (worktree ${ctx.cwd}, ~/.claude/projects/*/memory/, /tmp).`,
      hint: relPath
        ? `Edit \`${ctx.cwd}${relPath}\` instead — your worktree IS your working copy of the repo.`
        : `Your worktree IS your working copy of the repo — it contains everything the main repo does, including .claude/skills/ and .claude/settings.json. Edit those files at ${ctx.cwd}/.claude/** instead of the shared root.`,
    };
  },
});
