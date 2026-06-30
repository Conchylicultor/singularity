import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { worktreesDir } from "./worktree-op";

/**
 * Optional per-worktree zero-cache sidecar descriptor. Present ONLY when the
 * SINGULARITY_ZERO_CACHE opt-in is set (composed by the launcher's zeroCacheSpec
 * helper). The gateway spawns `command` with cwd=`cwd` and env ZERO_UPSTREAM_DB=
 * `upstreamDb` (plus a gateway-allocated ZERO_PORT and a per-worktree
 * ZERO_REPLICA_FILE). On-disk JSON key is exactly `zeroCache`.
 */
export interface ZeroCacheSpec {
  /** Spawn argv: `["bun","run",<abs start.ts within this worktree repo>]`. */
  command: string[];
  /** Upstream DSN zero-cache replicates from (loopback TCP to the fork DB). */
  upstreamDb: string;
  /** Working dir for the spawn — the worktree repo root. */
  cwd: string;
}

export interface WorktreeSpec {
  /** Namespace = subdomain = SINGULARITY_WORKTREE. Spec dir basename. */
  name: string;
  /** Absolute path to the backend working dir (`bun bin/index.ts` runs here). */
  server: string;
  /** Absolute path to web/dist. Omitted for API-only namespaces (central). */
  web?: string;
  /**
   * Explicit backend spawn argv (e.g. `["<abs>/server"]` for a compiled
   * release). Omitted for dev, where the gateway falls back to its
   * `bun bin/index.ts` convention. On-disk JSON key is exactly `command`
   * (the Go gateway reads it via `json:"command"`).
   */
  command?: string[];
  /**
   * Optional per-worktree zero-cache sidecar. Omitted unless the
   * SINGULARITY_ZERO_CACHE opt-in is set — so an opted-out spec serializes
   * byte-for-byte as before.
   */
  zeroCache?: ZeroCacheSpec;
}

/**
 * Register a servable namespace by writing its `spec.json`. The gateway's
 * fsnotify watcher picks it up; identity flows from the dir basename to the
 * backend's `SINGULARITY_WORKTREE` env var. Returns the spec.json path.
 *
 * This is the single seam shared by the dev build (identity derived from the git
 * worktree) and the release launcher (a fixed name, no git operation). The spec
 * is pure identity — composition filtering is baked into the `server`/`web`
 * trees the spec points at (a present `server.composition.generated.ts` selects
 * the filtered server), never carried here.
 */
export function writeWorktreeSpec({
  name,
  server,
  web,
  command,
  zeroCache,
}: WorktreeSpec): string {
  const dir = join(worktreesDir(), name);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "spec.json");
  // Build the spec object additively so absent keys are omitted entirely —
  // a dev spec must serialize byte-for-byte as before (no `web`/`command`/
  // `zeroCache` when unset), since the gateway treats a missing `command` as
  // "use the bun bin/index.ts convention" and a missing `zeroCache` as
  // "no zero-cache sidecar for this worktree".
  const spec: {
    server: string;
    web?: string;
    command?: string[];
    zeroCache?: ZeroCacheSpec;
  } = { server };
  if (web) spec.web = web;
  if (command) spec.command = command;
  if (zeroCache) spec.zeroCache = zeroCache;
  // Atomically publish the spec (temp + rename in the same dir) so a concurrent
  // reader — the gateway registry's loadFile, its periodic reconcile, or a lazy
  // resolve — never observes a truncated/partial spec.json and skips
  // registration. rename(2) within one filesystem is atomic, so every read sees
  // either the old complete file or the new complete file, never a torn write.
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(spec, null, 2) + "\n");
  renameSync(tmp, path);
  return path;
}

/**
 * Deregister a namespace by removing its registry entry from disk — the mirror
 * of `writeWorktreeSpec`. Deleting the spec file is the gateway's ONLY
 * deregistration path: its fsnotify watcher fires a Remove event and calls
 * `registry.remove()`, and tearing down the watched subdir also frees the
 * gateway's per-worktree kqueue/inotify watch.
 */
export async function removeWorktreeSpec(name: string): Promise<void> {
  const dir = worktreesDir();
  // New layout: <worktreesDir>/<name>/ (spec.json + logs/ + ops/ + zero/replica.db).
  await rm(join(dir, name), { recursive: true, force: true });
  // Legacy layout: flat <worktreesDir>/<name>.json written by old CLI versions.
  await rm(join(dir, `${name}.json`), { force: true });
}
