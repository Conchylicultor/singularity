import { MillerColumns } from "@plugins/layouts/plugins/miller/web";
import { AppShellLayout } from "@plugins/primitives/plugins/app-shell/web";
import { DebugApp } from "../slots";

export function DebugLayout() {
  return (
    <AppShellLayout sidebarSlot={DebugApp.Sidebar} toolbarSlot={DebugApp.Toolbar}>
      <MillerColumns />
    </AppShellLayout>
  );
}
