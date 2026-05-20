import { dirname, resolve } from "path";

export async function getMainRepoRoot(): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "--git-common-dir"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const raw = (await new Response(proc.stdout).text()).trim();
  await proc.exited;
  // In a worktree this is absolute; in main it may be ".git" (relative to cwd).
  return dirname(resolve(raw));
}
