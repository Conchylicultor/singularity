import {
  Pane,
  PaneChrome,
  defineRoute,
} from "@plugins/primitives/plugins/pane/web";
import { debugApp } from "@plugins/apps/plugins/debug/plugins/shell/core";
import { WorktreeCleanupPanel } from "./components/worktree-cleanup-panel";

export const worktreeCleanupPane = Pane.define({
  route: defineRoute({
    id: "worktree-cleanup",
    segment: "worktree-cleanup",
  }),
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
