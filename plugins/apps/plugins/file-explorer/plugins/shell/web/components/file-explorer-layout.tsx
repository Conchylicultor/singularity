import { FullPane } from "@plugins/layouts/plugins/full-pane/web";
import { AppShellLayout } from "@plugins/primitives/plugins/app-shell/web";
import { Inline } from "@plugins/primitives/plugins/css/plugins/inline/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { symbol } from "@plugins/ui/plugins/icons/core";
import { Icon } from "@plugins/ui/plugins/icons/web";
import { fileExplorerApp } from "../../core";
import { FileExplorer } from "../slots";

const folderIcon = symbol("folder");

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
      header={
        <Inline gap="sm">
          <Icon icon={folderIcon} className="icon-auto text-primary" />
          <Text variant="label" className="font-semibold">
            {fileExplorerApp.name}
          </Text>
        </Inline>
      }
    >
      <FullPane />
    </AppShellLayout>
  );
}
