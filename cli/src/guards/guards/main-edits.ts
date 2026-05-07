import { resolve } from "node:path";
import { HOME_DIR } from "../../paths";
import type { FileInput, Guard } from "../types";

function message(file: string, cwd: string): string {
  return `Refusing to edit ${file} — this path is not in the allowlist (worktree ${cwd}, ~/.claude/projects/*/memory/, /tmp). Your worktree IS your working copy of the repo — it contains everything the main repo does, including .claude/skills/ and .claude/settings.json. Edit those files at ${cwd}/.claude/** instead of the shared root. If — and only if — the user has EXPLICITLY instructed you in this conversation to edit outside these locations, create ${cwd}/.allow-main to bypass (gitignored, worktree-local). Do NOT create that file on your own initiative. Do NOT assume you have permission just based on the user task. Permission has to be EXPLICIT.`;
}

export const mainEditsGuard: Guard<FileInput> = {
  name: "main-edits",
  matcher: ["Write", "Edit", "NotebookEdit"],
  check(input, ctx) {
    let f = input.file_path;
    if (!f) return ctx.allow();
    if (!f.startsWith("/")) f = resolve(ctx.cwd, f);
    if (ctx.hasBypass(".allow-main")) return ctx.allow();

    if (f === ctx.cwd || f.startsWith(`${ctx.cwd}/`)) return ctx.allow();

    const home = HOME_DIR;
    if (/^\/tmp\//.test(f)) return ctx.allow();
    const memoryPrefix = `${home}/.claude/projects/`;
    if (f.startsWith(memoryPrefix)) {
      const rest = f.slice(memoryPrefix.length);
      const slash = rest.indexOf("/");
      if (slash !== -1 && rest.slice(slash + 1).startsWith("memory/")) {
        return ctx.allow();
      }
    }

    if (f.startsWith(`${home}/.claude/plans/`)) {
      return ctx.deny(
        `Do not edit plan files directly (${f}). Use the \`plan\` skill instead — it writes the plan doc to the correct location.`,
      );
    }

    return ctx.deny(message(f, ctx.cwd));
  },
};
