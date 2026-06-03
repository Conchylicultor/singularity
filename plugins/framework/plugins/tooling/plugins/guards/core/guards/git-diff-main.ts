import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { defineGuard } from "../define-guard";
import { findCall } from "../parse-shell";
import type { BashInput } from "../types";

function diffsAgainstMain(arg: string): boolean {
  return (
    arg === "main" ||
    arg === "origin/main" ||
    arg.startsWith("main...") ||
    arg.startsWith("main..") ||
    arg.startsWith("origin/main...") ||
    arg.startsWith("origin/main..")
  );
}

const MARKER = ".git-diff-main-reminded";

function touchMarker(path: string): void {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, "");
}

export const gitDiffMainGuard = defineGuard<BashInput>({
  name: "git-diff-main",
  matcher: "Bash",
  check(input, ctx) {
    const cmd = input.command;
    if (!cmd) return null;

    const gitDiffMain = findCall(
      cmd,
      (c) => c.name === "git" && c.args[0] === "diff" && c.args.some(diffsAgainstMain),
    );
    if (!gitDiffMain) return null;

    const marker = join(ctx.cwd, MARKER);
    if (existsSync(marker)) return null;

    touchMarker(marker);

    return {
      blocked:
        "`git diff main` compares against the current tip of main, which includes unrelated commits merged after your branch point.",
      hint: "Use `git diff $(git merge-base HEAD main)` to see only your worktree's changes. If you really need to diff against current main, just re-run the same command — this reminder only fires once.",
      skipEpilogue: true,
    };
  },
});
