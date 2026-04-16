import { resolve, sep } from "node:path";

const GIT = "/usr/bin/git";
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
): Promise<FileDiffResult> {
  if (!relPath || relPath.includes("\0")) {
    return { kind: "error", status: 400, message: "Invalid path" };
  }

  const absRoot = resolve(worktreePath);
  const absTarget = resolve(absRoot, relPath);
  if (!isPathInside(absRoot, absTarget)) {
    return { kind: "error", status: 400, message: "Invalid path" };
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

  if (!statusLine) {
    // No changes per status. Disambiguate tracked-clean vs nonexistent.
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
        ["diff", "--no-color", "HEAD", "--", relPath],
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
