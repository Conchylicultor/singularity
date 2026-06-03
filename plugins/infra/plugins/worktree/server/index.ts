import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";

export {
  ensureMainWorktreeRoot,
  worktreePathFor,
  setupWorktree,
  removeWorktree,
} from "./internal/worktree";
export {
  type WorktreeOp,
  markWorktreeOpStart,
  clearWorktreeOp,
  isWorktreeOpActive,
} from "./internal/worktree-op";

export default {
  name: "Worktree",
} satisfies ServerPluginDefinition;
