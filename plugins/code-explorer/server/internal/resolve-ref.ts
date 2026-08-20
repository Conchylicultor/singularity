import { GIT } from "@plugins/infra/plugins/paths/server";
import { spawnCaptured } from "@plugins/infra/plugins/spawn/core";

// Every git read in this file serves an open HTTP request from the code
// explorer: a local, metadata-or-blob read that finishes in milliseconds. The
// request is the deadline, and thirty seconds is well past the point where an
// answer still helps whoever is looking at the pane — so only a wedged child
// reaches it, and it fails as a named error instead of holding the request open
// forever.
const GIT_TIMEOUT_MS = 30_000;

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
  const result = await spawnCaptured(
    [
      GIT,
      "--no-optional-locks",
      "-C",
      worktreePath,
      "merge-base",
      "main",
      "HEAD",
    ],
    { timeoutMs: GIT_TIMEOUT_MS },
  );
  return result.exitCode === 0 ? result.stdout.trim() : ref;
}
