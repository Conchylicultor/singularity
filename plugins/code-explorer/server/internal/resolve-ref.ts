import { GIT } from "@plugins/infra/plugins/paths/server";

const NAMED_REFS = new Set(["HEAD", "main"]);
const SHA_RE = /^[0-9a-f]{7,40}$/;

export function isAllowedRef(ref: string): boolean {
  return NAMED_REFS.has(ref) || SHA_RE.test(ref);
}

// Kept for callers that want a Set-shaped check; new code should use
// `isAllowedRef` since it also accepts SHAs.
export const ALLOWED_REFS: { has(ref: string): boolean } = {
  has: isAllowedRef,
};

// Resolve a client-provided ref to a git object. `"main"` resolves to
// `git merge-base main HEAD` so callers see only branch-local changes.
// Named refs and SHAs pass through unchanged.
export async function resolveRef(
  worktreePath: string,
  ref: string,
): Promise<string> {
  if (ref !== "main") return ref;
  const proc = Bun.spawn(
    [GIT, "--no-optional-locks", "-C", worktreePath, "merge-base", "main", "HEAD"],
    { stdout: "pipe", stderr: "pipe" },
  );
  const [out, code] = await Promise.all([
    new Response(proc.stdout).text(),
    proc.exited,
  ]);
  return code === 0 ? out.trim() : ref;
}
