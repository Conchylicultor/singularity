import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { defineRoute } from "@plugins/primitives/plugins/pane/core";
import { debugApp } from "@plugins/apps/plugins/debug/plugins/shell/core";
import { WorktreeCleanupPanel } from "./components/worktree-cleanup-panel";

const worktreeCleanupRoute = defineRoute({
  id: "worktree-cleanup",
  segment: "worktree-cleanup",
});

export const worktreeCleanupPane = Pane.define({
  route: worktreeCleanupRoute,
  app: debugApp,
  component: WorktreeCleanupBody,
});

function WorktreeCleanupBody() {
  return (
    <PaneChrome pane={worktreeCleanupPane} title="Worktree Cleanup">
      <WorktreeCleanupPanel />
    </PaneChrome>
  );
}
