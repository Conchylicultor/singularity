import { Pane } from "@plugins/pane/web";
import { WorktreeCleanupPanel } from "./components/worktree-cleanup-panel";

export const worktreeCleanupPane = Pane.define({
  id: "worktree-cleanup",
  path: "/debug/worktree-cleanup",
  component: WorktreeCleanupPanel,
});
