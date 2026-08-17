import { join } from "node:path";
import { currentWorktreeName } from "@plugins/infra/plugins/paths/server";
import { releasesDir } from "../../data-dirs";

/**
 * A fresh release run id, `release-<ms>-<rand>`. The `<ms>` embeds a timestamp so
 * chronology is in the path, and the value also keys the `<run-id>` segment of
 * {@link releaseOutDir} and (for the engine) the `release_runs.id` DB row — so the
 * engine's on-disk dir and its DB row share one id.
 */
export function newReleaseRunId(): string {
  return `release-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * The one directory holding every run of `<composition>` for `<target>` in
 * `<namespace>`, plus that composition's `latest-<platform>` pointers.
 *
 * The single spelling of the layout: {@link releaseOutDir} (the writer),
 * `bundleRoot` (the reader) and `pruneReleaseRunDirs` (the sweeper) all derive
 * from here, so none of them can disagree about where releases live.
 */
export function compositionReleaseDir(
  namespace: string,
  composition: string,
  target: string,
): string {
  return releasesDir.file(namespace, `${composition}-${target}`);
}

/**
 * The `--out` directory passed to `./singularity release`. VERSIONED per run-id
 * (NOT overwrite-in-place): each release lands at its own
 * `<SINGULARITY_DIR>/releases/<worktree>/<comp>-<target>/<run-id>/` dir, so
 * builds are kept and a `latest-<platform>` symlink (written by the CLI, only
 * once a run is PACKED) points at the current one. The `<run-id>`
 * (`release-<ms>-<rand>`) gives chronology plus a stable dir key shared with the
 * engine's DB row.
 *
 * The 104-byte Unix-socket length cap no longer constrains this path: the
 * launcher (`launcher/bin/launch.ts`) reroots the embedded-PG, PgBouncer, and
 * gateway per-worktree backend sockets onto short `/tmp` dirs — the PG/PgBouncer
 * sockets via `SINGULARITY_PG_SOCKET_DIR`, the backend worktree sockets via
 * `SINGULARITY_SOCKETS_DIR` — so a long versioned `<run-id>` segment is safe even
 * for a direct `<out>/launch`.
 */
export function releaseOutDir(
  composition: string,
  target: string,
  runId: string,
): string {
  return join(
    compositionReleaseDir(currentWorktreeName(), composition, target),
    runId,
  );
}
