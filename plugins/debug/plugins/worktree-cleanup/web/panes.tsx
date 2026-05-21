import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { WorktreeCleanupPanel } from "./components/worktree-cleanup-panel";

export const worktreeCleanupPane = Pane.define({
  id: "worktree-cleanup",
  segment: "worktree-cleanup",
  component: WorktreeCleanupBody,
});

function WorktreeCleanupBody() {
  return (
    <PaneChrome pane={worktreeCleanupPane} title="Worktree Cleanup">
      <WorktreeCleanupPanel />
    </PaneChrome>
  );
}
