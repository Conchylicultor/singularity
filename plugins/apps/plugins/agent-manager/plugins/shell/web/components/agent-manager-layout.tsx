import { MillerColumns } from "@plugins/layouts/plugins/miller/web";
import { AppShellLayout } from "@plugins/primitives/plugins/app-shell/web";
import { Shell } from "@plugins/shell/web";

/**
 * The agent manager: the shell sidebar around Miller columns. The sidebar's
 * header is the shared app brand (AppShell.Brand); the sidebar-collapse
 * trigger lives in the first miller column's header (provided by
 * AppShellLayout via SurfaceChromeContext), and Cmd/Ctrl+B toggles it.
 */
export function AgentManagerLayout() {
  return (
    <AppShellLayout sidebarSlot={Shell.Sidebar}>
      <div className="h-full min-h-0">
        <MillerColumns />
      </div>
    </AppShellLayout>
  );
}
