import { AppShellLayout } from "@plugins/primitives/plugins/app-shell/web";
import { DebugApp } from "../slots";

export function DebugLayout() {
  return (
    <AppShellLayout
      sidebarSlot={DebugApp.Sidebar}
      toolbarSlot={DebugApp.Toolbar}
    />
  );
}
