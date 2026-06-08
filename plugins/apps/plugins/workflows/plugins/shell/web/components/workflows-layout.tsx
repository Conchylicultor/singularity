import { MillerColumns } from "@plugins/layouts/plugins/miller/web";
import { AppShellLayout } from "@plugins/primitives/plugins/app-shell/web";
import { WorkflowsApp } from "../slots";

export function WorkflowsLayout() {
  return (
    <AppShellLayout
      sidebarSlot={WorkflowsApp.Sidebar}
      toolbarSlot={WorkflowsApp.Toolbar}
    >
      <MillerColumns />
    </AppShellLayout>
  );
}
