import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";

export {
  ensureMainWorktreeRoot,
  gitWorktreesDir,
  worktreePathFor,
  isCanonicalWorktreePath,
  setupWorktree,
  removeWorktree,
  WorktreeGitTimeoutError,
} from "./internal/worktree";
export { withWorktreeMutateSlot } from "./internal/mutate-gate";
export {
  recentInAppRemovals,
  worktreeRemovalSink,
} from "./internal/removal-seam";
export type {
  InAppRemovalRecord,
  RemovalBranch,
  WorktreeRemovalEvent,
} from "./internal/removal-seam";
export {
  type WorktreeOp,
  type WorktreeOpPhase,
  type WorktreeOpInfo,
  type PushHolder,
  type DerivePushDeps,
  markWorktreeOpStart,
  setWorktreeOpPhase,
  clearWorktreeOp,
  isWorktreeOpActive,
  listActiveWorktreeOps,
  resolveActiveWorktreeOps,
  derivePushPhases,
  pushLockHeld,
  readPushHolder,
  writePushHolder,
  clearPushHolder,
  worktreesDir,
} from "./internal/worktree-op";
export {
  type WorktreeSpec,
  type ZeroCacheSpec,
  writeWorktreeSpec,
  removeWorktreeSpec,
} from "./internal/spec";
export {
  type CompositionMarker,
  type NamespaceProbe,
  COMPOSITION_MARKER_FILE,
  probeNamespace,
  namespaceCollision,
  readCompositionMarker,
  hasCompositionMarker,
} from "./internal/composition-namespace";

export default {} satisfies ServerPluginDefinition;
