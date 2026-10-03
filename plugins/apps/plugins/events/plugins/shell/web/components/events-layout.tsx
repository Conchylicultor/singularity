import { MillerColumns } from "@plugins/layouts/plugins/miller/web";
import { AppShellLayout } from "@plugins/primitives/plugins/app-shell/web";
import { Events } from "../slots";

/**
 * Events' main-area layout: the app shell wraps the `Events.Sidebar` left rail
 * (the events surfaces — the list, Sources — each contributed by its own
 * sub-plugin) around the Miller body. The sidebar header is the shared app brand
 * (AppShell.Brand).
 *
 * Sidebar-only, no app toolbar (the Pages/Settings shape): with no `chrome`-tier
 * toolbar above it, the active pane's own `PaneChrome` header owns the surface
 * top and hosts the sidebar toggle, instead of stacking an empty bar above it.
 */
export function EventsLayout() {
  return (
    <AppShellLayout sidebarSlot={Events.Sidebar}>
      <MillerColumns />
    </AppShellLayout>
  );
}
