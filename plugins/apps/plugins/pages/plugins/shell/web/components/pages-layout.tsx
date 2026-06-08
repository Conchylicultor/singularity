import { MillerColumns } from "@plugins/layouts/plugins/miller/web";
import { AppShellLayout } from "@plugins/primitives/plugins/app-shell/web";
import { Pages } from "../slots";

export function PagesLayout() {
  return (
    <AppShellLayout sidebarSlot={Pages.Sidebar} toolbarSlot={Pages.Toolbar}>
      <MillerColumns />
    </AppShellLayout>
  );
}
