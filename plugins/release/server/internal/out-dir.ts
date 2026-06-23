import { join } from "node:path";
import { SINGULARITY_DIR, currentWorktreeName } from "@plugins/infra/plugins/paths/server";

/**
 * The `--out` directory passed to `./singularity release`. SHORT and stable (NOT
 * timestamped) by construction: the embedded Postgres/gateway open Unix sockets
 * under the data root, and the path is capped at 104 bytes. The CLI default
 * (`dist/release/<comp>-<target>-<timestamp>/`) is deeply nested and blows that
 * limit at preview time, so we root the artifact under `<SINGULARITY_DIR>/
 * releases/<worktree>/<comp>-<target>` instead. Stable (no timestamp) means a
 * re-release overwrites in place — the CLI `rmSync`s the out dir before staging.
 *
 * Lives in `server/internal/` (not `shared/`): it imports the server-only paths
 * module, and `shared/` may only import shared/core.
 */
export function releaseOutDir(composition: string, target: string): string {
  return join(
    SINGULARITY_DIR,
    "releases",
    currentWorktreeName(),
    `${composition}-${target}`,
  );
}
