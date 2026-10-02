import { MillerColumns } from "@plugins/layouts/plugins/miller/web";
import { AppShellLayout } from "@plugins/primitives/plugins/app-shell/web";
import { symbol } from "@plugins/ui/plugins/icons/core";
import { Pages } from "../slots";

/**
 * Pages' sidebar toggle: the mockup's `dock-to-left`, filled while the sidebar
 * is open and in outline while it is closed, so it still shows the state.
 */
const sidebarToggleIcons = {
  open: { icon: symbol("dock-to-left"), active: true },
  closed: { icon: symbol("dock-to-left") },
};

export function PagesLayout() {
  // Sidebar-only, no app toolbar (mirrors the Settings app shell): with no
  // `chrome`-tier toolbar above it, the page-detail pane's own `PaneChrome`
  // header owns the surface top — it hosts the sidebar toggle and the page
  // breadcrumb in a single bar, instead of stacking an empty toolbar above it.
  return (
    <AppShellLayout
      sidebarSlot={Pages.Sidebar}
      sidebarToggleIcons={sidebarToggleIcons}
    >
      <MillerColumns />
    </AppShellLayout>
  );
}
