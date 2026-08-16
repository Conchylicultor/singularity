import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { debugApp } from "@plugins/apps/plugins/debug/plugins/shell/core";
import { WorktreeCleanupPanel } from "./components/worktree-cleanup-panel";

export const worktreeCleanupPane = Pane.define({
  id: "worktree-cleanup",
  app: debugApp,
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
