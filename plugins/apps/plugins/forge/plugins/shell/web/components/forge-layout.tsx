import { AppShellLayout } from "@plugins/primitives/plugins/app-shell/web";
import { Forge } from "../slots";

export function ForgeLayout() {
  return (
    <AppShellLayout
      sidebarSlot={Forge.Sidebar}
      toolbarSlot={Forge.Toolbar}
    />
  );
}
