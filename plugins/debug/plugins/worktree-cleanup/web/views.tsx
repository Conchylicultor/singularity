import type { PaneDescriptor } from "@plugins/shell/web";
import { WorktreeCleanupPanel } from "./components/worktree-cleanup-panel";

export function worktreeCleanupPane(): PaneDescriptor {
  return {
    title: "Worktree Cleanup",
    component: WorktreeCleanupPanel,
    path: "/debug/worktree-cleanup",
  };
}
