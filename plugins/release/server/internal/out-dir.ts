import { join } from "node:path";
import { SINGULARITY_DIR, currentWorktreeName } from "@plugins/infra/plugins/paths/server";

/**
 * A fresh release run id, `release-<ms>-<rand>`. The `<ms>` embeds a timestamp so
 * chronology is in the path, and the value also keys the `<run-id>` segment of
 * `releaseOutDir` and (for the engine) the `release_runs.id` DB row — so the
 * engine's on-disk dir and its DB row share one id.
 */
export function newReleaseRunId(): string {
  return `release-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * The `--out` directory passed to `./singularity release`. VERSIONED per run-id
 * (NOT overwrite-in-place): each release lands at its own
 * `<SINGULARITY_DIR>/releases/<worktree>/<comp>-<target>/<run-id>/` dir, so
 * builds are kept and a `latest` symlink (written by the CLI) points at the
 * current one. The `<run-id>` (`release-<ms>-<rand>`) gives chronology plus a
 * stable dir key shared with the engine's DB row.
 *
 * The 104-byte Unix-socket length cap no longer constrains this path: the
 * launcher (`launcher/bin/launch.ts`) reroots the embedded-PG, PgBouncer, and
 * gateway per-worktree backend sockets onto short `/tmp` dirs — the PG/PgBouncer
 * sockets via `SINGULARITY_PG_SOCKET_DIR`, the backend worktree sockets via
 * `SINGULARITY_SOCKETS_DIR` — so a long versioned `<run-id>` segment is safe even
 * for a direct `<out>/launch`.
 *
 * Lives in `server/internal/` (not `shared/`): it imports the server-only paths
 * module, and `shared/` may only import shared/core.
 */
export function releaseOutDir(composition: string, target: string, runId: string): string {
  return join(
    SINGULARITY_DIR,
    "releases",
    currentWorktreeName(),
    `${composition}-${target}`,
    runId,
  );
}
