import { copyFileSync, existsSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

async function git(
  root: string,
  args: string[],
  env?: Record<string, string>,
): Promise<{ code: number; stdout: string }> {
  const proc = Bun.spawn(["git", ...args], {
    cwd: root,
    env: env ?? process.env,
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = await new Response(proc.stdout).text();
  return { code: await proc.exited, stdout: stdout.trim() };
}

/**
 * Content hash of the full working tree (tracked + working changes, honoring
 * .gitignore) WITHOUT mutating the user's real index. Uses a throwaway temp
 * index seeded from the real one (for its stat cache), then `add -A` +
 * `write-tree`. Commit-message amends do NOT change this hash (write-tree is
 * content-only), so a `push` after an unchanged `build` produces the same hash.
 *
 * Fail-open: returns null if git is unavailable or any step fails — callers
 * then run uncached. The cache must never block or break a check run.
 */
export async function computeTreeHash(root: string): Promise<string | null> {
  let tmpDir: string | undefined;
  try {
    tmpDir = mkdtempSync(join(tmpdir(), "sing-treehash-"));
    const tmpIndex = join(tmpDir, "index");
    const env = { ...process.env, GIT_INDEX_FILE: tmpIndex };

    // Seed from the real index to inherit its stat cache (avoids a full content
    // rescan). `--git-path index` resolves correctly in a linked worktree.
    const rel = (await git(root, ["rev-parse", "--git-path", "index"])).stdout;
    const realIndex = rel ? join(root, rel) : "";
    if (realIndex && existsSync(realIndex)) {
      copyFileSync(realIndex, tmpIndex);
      // Refresh stat info against the seeded index (cheap); errors are benign.
      await git(root, ["update-index", "-q", "--refresh"], env);
    } else if ((await git(root, ["read-tree", "HEAD"], env)).code !== 0) {
      return null;
    }

    if ((await git(root, ["add", "-A"], env)).code !== 0) return null;
    const wt = await git(root, ["write-tree"], env);
    if (wt.code !== 0) return null;
    return /^[0-9a-f]{40,64}$/.test(wt.stdout) ? wt.stdout : null;
  // eslint-disable-next-line promise-safety/no-bare-catch, promise-safety/no-absorbed-failure -- explicit fail-open contract: any error (no git, spawn failure, permissions) safely returns null so checks still run uncached; propagating would break every check in non-git environments
  } catch {
    // Any failure (not a git repo, spawn error, etc.) → degrade to uncached.
    return null;
  } finally {
    // force:true suppresses ENOENT; the dir is one we just created under tmp.
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  }
}
