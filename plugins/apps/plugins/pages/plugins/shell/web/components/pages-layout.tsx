import { MillerColumns } from "@plugins/layouts/plugins/miller/web";
import { AppShellLayout } from "@plugins/primitives/plugins/app-shell/web";
import { Pages } from "../slots";

export function PagesLayout() {
  // Sidebar-only, no app toolbar (mirrors the Settings app shell): with no
  // `chrome`-tier toolbar above it, the page-detail pane's own `PaneChrome`
  // header owns the surface top — it hosts the sidebar toggle and the page
  // breadcrumb in a single bar, instead of stacking an empty toolbar above it.
  return (
    <AppShellLayout sidebarSlot={Pages.Sidebar}>
      <MillerColumns />
    </AppShellLayout>
  );
}
