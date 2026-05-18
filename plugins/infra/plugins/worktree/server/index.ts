import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";

export {
  ensureMainWorktreeRoot,
  worktreePathFor,
  setupWorktree,
  removeWorktree,
} from "./internal/worktree";

export default {
  id: "worktree",
  name: "Worktree",
} satisfies ServerPluginDefinition;
