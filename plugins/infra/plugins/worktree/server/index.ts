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
  type WorktreeOp,
  type WorktreeOpPhase,
  type WorktreeOpInfo,
  type PushHolder,
  type DerivePushDeps,
  markWorktreeOpStart,
  setWorktreeOpPhase,
  clearWorktreeOp,
  isWorktreeOpActive,
  listWorktreeOps,
  listActiveWorktreeOps,
  resolveActiveWorktreeOps,
  derivePushPhases,
  pushLockHeld,
  readPushHolder,
  writePushHolder,
  clearPushHolder,
} from "./internal/worktree-op";
export {
  type WorktreeSpec,
  writeWorktreeSpec,
  removeWorktreeSpec,
} from "./internal/spec";
export {
  type CompositionMarker,
  type NamespaceProbe,
  type NamespaceClaimant,
  probeNamespace,
  namespaceCollision,
  stampCompositionMarker,
  readCompositionMarker,
  hasCompositionMarker,
} from "./internal/composition-namespace";

export default {} satisfies ServerPluginDefinition;
