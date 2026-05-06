import { AppShellLayout } from "@plugins/primitives/plugins/app-shell/web";
import { FileExplorer } from "../slots";

export function FileExplorerLayout() {
  return (
    <AppShellLayout
      sidebarSlot={FileExplorer.Sidebar}
      toolbarSlot={FileExplorer.Toolbar}
    />
  );
}
