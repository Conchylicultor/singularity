import { resolve, sep } from "node:path";
import { isAllowedRef } from "./resolve-ref";

import { GIT } from "@plugins/infra/plugins/paths/server";
const MAX_BYTES = 2 * 1024 * 1024;

export type FileDiffResult =
  | { kind: "ok"; diff: string }
  | { kind: "error"; status: number; message: string };

function isPathInside(root: string, target: string): boolean {
  const rootNorm = root.endsWith(sep) ? root : root + sep;
  return target === root || target.startsWith(rootNorm);
}

async function runGit(
  args: string[],
  cwd: string,
  tolerateExit1 = false,
): Promise<string | null> {
  const proc = Bun.spawn([GIT, "-C", cwd, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, code] = await Promise.all([
    new Response(proc.stdout).text(),
    proc.exited,
  ]);
  if (code === 0 || (tolerateExit1 && code === 1)) return out;
  return null;
}

export async function getFileDiff(
  worktreePath: string,
  relPath: string,
  base: string = "HEAD",
  head?: string,
  fromPath?: string,
): Promise<FileDiffResult> {
  if (!relPath || relPath.includes("\0")) {
    return { kind: "error", status: 400, message: "Invalid path" };
  }
  if (fromPath !== undefined && (fromPath === "" || fromPath.includes("\0"))) {
    return { kind: "error", status: 400, message: "Invalid from" };
  }
  if (!isAllowedRef(base)) {
    return { kind: "error", status: 400, message: "Invalid base" };
  }
  if (head !== undefined && !isAllowedRef(head)) {
    return { kind: "error", status: 400, message: "Invalid head" };
  }

  const absRoot = resolve(worktreePath);
  const absTarget = resolve(absRoot, relPath);
  if (!isPathInside(absRoot, absTarget)) {
    return { kind: "error", status: 400, message: "Invalid path" };
  }
  if (fromPath !== undefined) {
    const absFrom = resolve(absRoot, fromPath);
    if (!isPathInside(absRoot, absFrom)) {
      return { kind: "error", status: 400, message: "Invalid from" };
    }
  }

  const resolvedBase =
    base === "main"
      ? ((await runGit(["merge-base", "main", "HEAD"], absRoot))?.trim() ?? base)
      : base;

  // Range diff (commit-to-commit). Untracked / working-tree handling does not
  // apply — both sides are real refs. -M / -C let git emit a unified rename
  // diff when both old and new paths are passed.
  if (head !== undefined) {
    const pathArgs =
      fromPath !== undefined ? ["--", fromPath, relPath] : ["--", relPath];
    const diff = await runGit(
      ["diff", "--no-color", "-M", "-C", resolvedBase, head, ...pathArgs],
      absRoot,
    );
    if (diff === null) {
      return { kind: "error", status: 500, message: "git diff failed" };
    }
    if (diff.length > MAX_BYTES) {
      return { kind: "error", status: 413, message: "Diff too large" };
    }
    return { kind: "ok", diff };
  }

  const status = await runGit(
    ["status", "--porcelain", "--", relPath],
    absRoot,
  );
  if (status === null) {
    return { kind: "error", status: 500, message: "git status failed" };
  }

  const statusLine = status.split("\n").find((l) => l.length > 0);
  const isUntracked = statusLine?.startsWith("??") ?? false;

  if (!statusLine && resolvedBase === "HEAD") {
    const file = Bun.file(absTarget);
    if (!(await file.exists())) {
      return { kind: "error", status: 404, message: "File not found" };
    }
    return { kind: "ok", diff: "" };
  }

  const diff = isUntracked
    ? await runGit(
        ["diff", "--no-color", "--no-index", "--", "/dev/null", relPath],
        absRoot,
        true,
      )
    : await runGit(
        [
          "diff",
          "--no-color",
          "-M",
          "-C",
          resolvedBase,
          "--",
          ...(fromPath !== undefined ? [fromPath, relPath] : [relPath]),
        ],
        absRoot,
      );

  if (diff === null) {
    return { kind: "error", status: 500, message: "git diff failed" };
  }
  if (diff.length > MAX_BYTES) {
    return { kind: "error", status: 413, message: "Diff too large" };
  }
  return { kind: "ok", diff };
}
