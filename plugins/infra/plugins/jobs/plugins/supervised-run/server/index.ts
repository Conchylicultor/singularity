import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { reconcileSupervisedRuns } from "./internal/supervisor";

export { defineSupervisedRunKind } from "./internal/registry";
// The registration precondition, exported because `startSupervisedRun` is no
// longer the only entry point that needs it: waiting on a run of an
// unregistered kind is a wait nothing will ever wake.
export { assertRegistered } from "./internal/registry";
export type {
  SupervisedRunKind,
  SupervisedRunKindSpec,
  UnfinishedRun,
} from "./internal/registry";
export {
  startSupervisedRun,
  killSupervisedRun,
  reconcileSupervisedRuns,
} from "./internal/supervisor";
export type { StartedRun, KillOutcome } from "./internal/supervisor";
// The spawn-boundary failure. Exported because the ONE safe compensating action
// after a failed start — closing the claimed row — is safe on only one side of
// it: see `SupervisedSpawnError`.
export {
  SupervisedSpawnError,
  isSupervisedSpawnError,
} from "./internal/supervisor";
export { TRANSCRIPT_CEILING_BYTES } from "./internal/tail";

export default {
  description:
    "Long-running out-of-process work that survives a backend restart: a detached child whose merged output goes to a transcript FILE (published live by tailing it, so there is no pipe-shaped path to lose), a POSIX shim that records any command's exit status into an atomic marker, and ONE boot reconciler over every registered kind that closes the dead and re-attaches the living.",
  // The reconciler is registered ONCE here, not once per consumer, and this is
  // where the duplication actually dies: `reconcileOrphanBuilds` and
  // `reconcileOrphanReleases` are two near-copies of one loop, and each solved a
  // different subset of the problem. `onReady` rather than `onReadyBlocking`
  // because nothing about serving a request depends on it — a run adopted a
  // second late is a run adopted.
  onReady: () => reconcileSupervisedRuns(),
} satisfies ServerPluginDefinition;
