import { FullPane } from "@plugins/layouts/plugins/full-pane/web";
import { AppShellLayout } from "@plugins/primitives/plugins/app-shell/web";
import { FileExplorer } from "../slots";

/**
 * The file explorer: the Places sidebar beside one full-surface browser pane.
 * Every location is its own route (`FullPane` paints the current one), so back
 * and forward are the browser history.
 *
 * No app toolbar contributes today, so the browser's own toolbar is the
 * surface's top edge and hosts the sidebar toggle.
 */
export function FileExplorerLayout() {
  return (
    <AppShellLayout
      sidebarSlot={FileExplorer.Sidebar}
      toolbarSlot={FileExplorer.Toolbar}
    >
      <FullPane />
    </AppShellLayout>
  );
}
