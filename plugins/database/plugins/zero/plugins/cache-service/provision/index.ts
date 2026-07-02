/**
 * Install-time provisioning contribution for the zero-cache sidecar, discovered
 * by the framework provisioning runner (defineCollectedDir("provision")) and run
 * during the root `postinstall`. Builds @rocicorp/zero-sqlite3's native addon for
 * the Node-24 ABI, then ensures a Node-24 runtime is available (cached/host/download).
 *
 * FENCED: gated on the same `zeroCacheEnabled()` opt-in switch as the runtime
 * sidecar, so a disabled Zero (the default) costs nothing to install — no native
 * addon build, no ~35 MB Node 24 tarball download. Opting in therefore requires
 * the flag set at INSTALL time, e.g. `SINGULARITY_ZERO_CACHE=1 ./singularity build`;
 * flipping it on for an already-installed tree needs a re-provision (re-run the
 * build with the flag). Acceptable for a frozen opt-in feature — see the fence
 * note in ../../CLAUDE.md. The slot-sweep job and the worktree-cleanup reap stay
 * unconditional (they reclaim artifacts orphaned across a flag toggle).
 *
 * Node builtins + `@plugins` barrel imports only. The `@plugins/*` alias resolves
 * in the `bun install` postinstall context (bun honors the repo tsconfig paths),
 * as the transitive `@plugins/infra/plugins/paths/core` import in ensure-zero-node
 * already relies on; relative escapes into a sibling plugin's tree are forbidden.
 */
import { zeroCacheEnabled } from "@plugins/database/plugins/zero/core";
import { ensureZeroSqlite3 } from "../scripts/ensure-zero-sqlite3";
import { ensureZeroNode } from "../scripts/ensure-zero-node";

export default async function provision(): Promise<void> {
  // Fence off at install time: with Zero disabled (the default) this is a no-op,
  // so a fresh machine pays neither the native addon build nor the Node 24
  // download. console is the sink here — provision/ runs in the server-less
  // postinstall context and is exempted from no-console-log alongside scripts/.
  if (!zeroCacheEnabled()) {
    console.log(
      "[provision] zero/cache-service skipped — SINGULARITY_ZERO_CACHE not set. " +
        "Opt in at install time (SINGULARITY_ZERO_CACHE=1 ./singularity build) to build the sidecar.",
    );
    return;
  }
  await ensureZeroSqlite3();
  await ensureZeroNode();
}
