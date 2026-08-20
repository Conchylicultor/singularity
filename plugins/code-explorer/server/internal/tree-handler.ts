import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { GIT } from "@plugins/infra/plugins/paths/server";
import { spawnCaptured } from "@plugins/infra/plugins/spawn/core";
import { getCodeTree } from "@plugins/code-explorer/plugins/code-api/core";
import { resolveWorktreePath } from "./resolve-worktree-path";

// Every git read in this file serves an open HTTP request from the code
// explorer: a local, metadata-or-blob read that finishes in milliseconds. The
// request is the deadline, and thirty seconds is well past the point where an
// answer still helps whoever is looking at the pane — so only a wedged child
// reaches it, and it fails as a named error instead of holding the request open
// forever.
const GIT_TIMEOUT_MS = 30_000;

export const handleTree = implement(getCodeTree, async ({ params }) => {
  const { worktree } = params;
  if (!worktree) throw new HttpError(400, "Missing worktree");

  const wtPath = await resolveWorktreePath(worktree);
  if (!wtPath) throw new HttpError(404, "Not found");

  const result = await spawnCaptured(
    [
      GIT,
      "--no-optional-locks",
      "-C",
      wtPath,
      "ls-files",
      "--cached",
      "--others",
      "--exclude-standard",
    ],
    { timeoutMs: GIT_TIMEOUT_MS },
  );
  if (result.exitCode !== 0) {
    throw new HttpError(500, "git ls-files failed");
  }

  const files = result.stdout
    .split("\n")
    .filter((line) => line.length > 0)
    .sort();

  return { files };
});
