import { resolve } from "node:path";
import { HOME_DIR } from "@plugins/infra/plugins/paths/core";
import { defineGuard } from "../define-guard";
import type { FileInput } from "../types";
import { worktreeContextOf } from "../worktree-root";

export const mainEditsGuard = defineGuard<FileInput>({
  name: "main-edits",
  matcher: ["Write", "Edit", "NotebookEdit"],
  bypassToken: ".allow-main",
  check(input, ctx) {
    let f = input.file_path;
    if (!f) return null;
    if (!f.startsWith("/")) f = resolve(ctx.cwd, f);

    // The allowed boundary is the worktree ROOT, not raw cwd — the hook cwd
    // tracks the shell's persistent `cd` and can sit in any subdirectory.
    const wt = worktreeContextOf(ctx.cwd);
    const workRoot = wt?.worktreeRoot ?? ctx.cwd;
    if (f === workRoot || f.startsWith(`${workRoot}/`)) return null;

    // `/tmp` is a symlink to `/private/tmp` on macOS, so the scratchpad the
    // harness hands agents surfaces as its resolved `/private/tmp/...` form.
    if (/^\/(private\/)?tmp\//.test(f)) return null;

    const projectsPrefix = `${HOME_DIR}/.claude/projects/`;
    if (f.startsWith(projectsPrefix)) {
      const rest = f.slice(projectsPrefix.length);
      const slash = rest.indexOf("/");
      // Per-project auto-memory files: ~/.claude/projects/<slug>/memory/**
      if (slash !== -1 && rest.slice(slash + 1).startsWith("memory/")) {
        return null;
      }
      // Persisted Workflow scripts the Workflow tool tells agents to edit in
      // place: ~/.claude/projects/<slug>/<session>/workflows/scripts/**
      if (rest.includes("/workflows/scripts/")) {
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

    // Re-base a main-checkout path onto the worktree for the hint — but only
    // when f is genuinely in the main checkout. A path inside ANOTHER agent's
    // worktree must not be re-based (it would compose a nonsense path).
    const relPath =
      wt && f.startsWith(`${wt.repoRoot}/`) && worktreeContextOf(f) === null
        ? f.slice(wt.repoRoot.length)
        : null;

    return {
      blocked: `Refusing to edit ${f} — this path is not in the allowlist (worktree ${workRoot}, ~/.claude/projects/*/memory/, /tmp).`,
      hint: relPath
        ? `Edit \`${workRoot}${relPath}\` instead — your worktree IS your working copy of the repo.`
        : `Your worktree IS your working copy of the repo — it contains everything the main repo does, including .claude/skills/ and .claude/settings.json. Edit those files at ${workRoot}/.claude/** instead of the shared root.`,
    };
  },
});
