import { MillerColumns } from "@plugins/layouts/plugins/miller/web";
import { AppShellLayout } from "@plugins/primitives/plugins/app-shell/web";
import { Studio } from "../slots";

export function StudioLayout() {
  return (
    <AppShellLayout sidebarSlot={Studio.Sidebar} toolbarSlot={Studio.Toolbar}>
      <MillerColumns />
    </AppShellLayout>
  );
}
