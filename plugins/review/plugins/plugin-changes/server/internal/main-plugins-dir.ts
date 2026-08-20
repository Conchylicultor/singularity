import { dirname, join, resolve } from "node:path";
import { REPO_ROOT, GIT } from "@plugins/infra/plugins/paths/server";
import { spawnCaptured } from "@plugins/infra/plugins/spawn/core";

// A single `rev-parse` metadata read, memoized for the process, taken while a
// review pane is waiting. Thirty seconds is only ever reached by a wedge.
const GIT_TIMEOUT_MS = 30_000;

let cachedMainPluginsDir: string | null = null;
let cachedMainRoot: string | null = null;

export async function getMainRoot(): Promise<string> {
  if (cachedMainRoot) return cachedMainRoot;

  const result = await spawnCaptured(
    [GIT, "--no-optional-locks", "rev-parse", "--git-common-dir"],
    { cwd: REPO_ROOT, timeoutMs: GIT_TIMEOUT_MS },
  );
  if (result.exitCode !== 0)
    throw new Error("Failed to resolve git common dir");

  const absGitDir = resolve(REPO_ROOT, result.stdout.trim());
  cachedMainRoot = dirname(absGitDir);
  return cachedMainRoot;
}

export async function getMainPluginsDir(): Promise<string> {
  if (cachedMainPluginsDir) return cachedMainPluginsDir;
  cachedMainPluginsDir = join(await getMainRoot(), "plugins");
  return cachedMainPluginsDir;
}
