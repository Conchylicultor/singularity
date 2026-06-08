import { MillerColumns } from "@plugins/layouts/plugins/miller/web";
import { AppShellLayout } from "@plugins/primitives/plugins/app-shell/web";
import { Forge } from "../slots";

export function ForgeLayout() {
  return (
    <AppShellLayout sidebarSlot={Forge.Sidebar} toolbarSlot={Forge.Toolbar}>
      <MillerColumns />
    </AppShellLayout>
  );
}
