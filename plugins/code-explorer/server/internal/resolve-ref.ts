const GIT = "/usr/bin/git";

export const ALLOWED_REFS = new Set(["HEAD", "main"]);

// Resolve a client-provided ref to a git object. `"main"` resolves to
// `git merge-base main HEAD` so callers see only branch-local changes.
export async function resolveRef(
  worktreePath: string,
  ref: string,
): Promise<string> {
  if (ref !== "main") return ref;
  const proc = Bun.spawn(
    [GIT, "-C", worktreePath, "merge-base", "main", "HEAD"],
    { stdout: "pipe", stderr: "pipe" },
  );
  const [out, code] = await Promise.all([
    new Response(proc.stdout).text(),
    proc.exited,
  ]);
  return code === 0 ? out.trim() : ref;
}
