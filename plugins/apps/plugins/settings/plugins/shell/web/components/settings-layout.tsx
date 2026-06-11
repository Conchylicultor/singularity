import { MillerColumns } from "@plugins/layouts/plugins/miller/web";
import { AppShellLayout } from "@plugins/primitives/plugins/app-shell/web";
import { Settings } from "../slots";

export function SettingsLayout() {
  return (
    <AppShellLayout sidebarSlot={Settings.Sidebar}>
      <MillerColumns />
    </AppShellLayout>
  );
}
