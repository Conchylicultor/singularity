import {
  spawnCaptured,
  spawnExpectOk,
} from "@plugins/infra/plugins/spawn/core";

// Wedge-breaker for the local `git config` reads and writes below — orders of
// magnitude above what any of them take, so only a wedged child trips it. A CLI
// process owns no deadline of its own, but that is a reason to bound these, not
// to leave them open: nothing else would ever break such a wedge (the
// fleet-level op-wedge watchdog was retired 2026-07-28).
const GIT_CONFIG_TIMEOUT_MS = 60_000;

/**
 * Read one `--local` config value, or `null` when the key is unset.
 *
 * `null` here is not an absorbed failure: an unset key is a legitimate, fully
 * expected READING of the config file, not a lookup that went wrong. A git
 * failure that is not "key unset" still surfaces — `git config --get` exits 1
 * for a missing key and ≥2 for a broken file, and only exit 1 comes back as
 * `null`; anything else throws.
 *
 * `--local` in a linked worktree reads the CLONE's `config`, not a per-worktree
 * one (that is `--worktree`). That is exactly the tier we want for a cache of a
 * remote's answer: one file per clone, untracked, shared by every worktree of
 * it, readable with no server running.
 */
export async function gitConfigGet(
  key: string,
  cwd: string,
): Promise<string | null> {
  const result = await spawnCaptured(
    ["git", "config", "--local", "--get", key],
    { cwd, timeoutMs: GIT_CONFIG_TIMEOUT_MS },
  );
  if (result.exitCode === 0) return result.stdout.trim();
  if (result.exitCode === 1) return null;
  throw new Error(
    `git config --get ${key} failed (exit ${result.exitCode})` +
      (result.stderr.trim() ? `\n${result.stderr.trim()}` : ""),
  );
}

/** Write one `--local` config value. Throws on failure. */
export async function gitConfigSet(
  key: string,
  value: string,
  cwd: string,
): Promise<void> {
  await spawnExpectOk(["git", "config", "--local", key, value], {
    cwd,
    timeoutMs: GIT_CONFIG_TIMEOUT_MS,
  });
}

/**
 * Remove one `--local` config key. A key that was already unset is success —
 * git exits 5 for it, and "it is not there" is what the caller asked for.
 */
export async function gitConfigUnset(key: string, cwd: string): Promise<void> {
  const result = await spawnCaptured(
    ["git", "config", "--local", "--unset", key],
    { cwd, timeoutMs: GIT_CONFIG_TIMEOUT_MS },
  );
  if (result.exitCode === 0 || result.exitCode === 5) return;
  throw new Error(
    `git config --unset ${key} failed (exit ${result.exitCode})` +
      (result.stderr.trim() ? `\n${result.stderr.trim()}` : ""),
  );
}
