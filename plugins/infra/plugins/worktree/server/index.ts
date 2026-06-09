import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";

export {
  ensureMainWorktreeRoot,
  worktreePathFor,
  setupWorktree,
  removeWorktree,
} from "./internal/worktree";
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
  PUSH_LOCK_PATH,
  worktreesDir,
} from "./internal/worktree-op";

export default {
} satisfies ServerPluginDefinition;
