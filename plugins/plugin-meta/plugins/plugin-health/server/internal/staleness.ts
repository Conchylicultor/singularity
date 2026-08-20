import { GIT } from "@plugins/infra/plugins/paths/server";
import { ensureMainWorktreeRoot } from "@plugins/infra/plugins/worktree/server";
import { spawnCaptured } from "@plugins/infra/plugins/spawn/core";

// Both reads walk history for one plugin path, on an open request for the
// plugin-health pane. Real work, but seconds of it at most; a minute is the
// point past which the pane has given up on an answer anyway.
const GIT_TIMEOUT_MS = 60_000;

export async function commitsSince(
  commitHash: string,
  pluginPath: string,
): Promise<number> {
  const cwd = await ensureMainWorktreeRoot();
  const result = await spawnCaptured(
    [
      GIT,
      "--no-optional-locks",
      "rev-list",
      "--count",
      `${commitHash}..HEAD`,
      "--",
      `plugins/${pluginPath}`,
    ],
    { cwd, timeoutMs: GIT_TIMEOUT_MS },
  );
  return parseInt(result.stdout.trim(), 10) || 0;
}

export async function apiChangedSince(
  commitHash: string,
  pluginPath: string,
): Promise<boolean> {
  const cwd = await ensureMainWorktreeRoot();
  const result = await spawnCaptured(
    [
      GIT,
      "--no-optional-locks",
      "diff",
      "--name-only",
      commitHash,
      "HEAD",
      "--",
      `plugins/${pluginPath}/web/index.ts`,
      `plugins/${pluginPath}/server/index.ts`,
      `plugins/${pluginPath}/core/index.ts`,
    ],
    { cwd, timeoutMs: GIT_TIMEOUT_MS },
  );
  return result.stdout.trim().length > 0;
}
