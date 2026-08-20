import { ensureMainWorktreeRoot } from "@plugins/infra/plugins/worktree/server";
import { GIT } from "@plugins/infra/plugins/paths/server";
import { spawnCaptured } from "@plugins/infra/plugins/spawn/core";
import { implement } from "@plugins/infra/plugins/endpoints/server";
import { getRepoInfo } from "../../core/endpoints";

// `git remote get-url` reads one config line — no network despite the name —
// on an open request, memoized for the process afterwards. Thirty seconds is
// only ever reached by a wedge.
const GIT_TIMEOUT_MS = 30_000;

let cached: { githubBase: string | null } | null = null;

function parseGithubBase(remote: string): string | null {
  const trimmed = remote.trim();
  const ssh = trimmed.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/);
  if (ssh) return `https://github.com/${ssh[1]}/${ssh[2]}`;
  const https = trimmed.match(
    /^https?:\/\/github\.com\/([^/]+)\/(.+?)(?:\.git)?$/,
  );
  if (https) return `https://github.com/${https[1]}/${https[2]}`;
  return null;
}

async function loadRepoInfo(): Promise<{ githubBase: string | null }> {
  if (cached) return cached;
  const cwd = await ensureMainWorktreeRoot();
  const result = await spawnCaptured([GIT, "remote", "get-url", "origin"], {
    cwd,
    timeoutMs: GIT_TIMEOUT_MS,
  });
  if (result.exitCode !== 0) {
    cached = { githubBase: null };
    return cached;
  }
  cached = { githubBase: parseGithubBase(result.stdout) };
  return cached;
}

export const handleRepoInfo = implement(getRepoInfo, async () => {
  return loadRepoInfo();
});
