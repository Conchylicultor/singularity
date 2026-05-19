import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { defineGuard } from "../define-guard";
import { parseShell } from "../parse-shell";
import type { BashInput } from "../types";

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

    const { calls } = parseShell(cmd);
    const gitCall = calls.find((c) => c.name === "git");
    if (!gitCall) return null;

    const args = gitCall.args;
    if (args[0] !== "diff") return null;

    const hasMainRef = args.some(
      (a) =>
        a === "main" ||
        a === "origin/main" ||
        a.startsWith("main...") ||
        a.startsWith("main..") ||
        a.startsWith("origin/main...") ||
        a.startsWith("origin/main.."),
    );
    if (!hasMainRef) return null;

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
