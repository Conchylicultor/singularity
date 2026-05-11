import type { ServerPluginDefinition } from "@server/types";

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
