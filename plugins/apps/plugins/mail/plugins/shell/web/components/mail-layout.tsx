import { MillerColumns } from "@plugins/layouts/plugins/miller/web";
import { AppShellLayout } from "@plugins/primitives/plugins/app-shell/web";

/**
 * Mail's main-area layout. Phase 1 has no left-rail content yet, so the shell
 * collapses to a full-surface host and the landing pane fills the width. The
 * `Mail.Sidebar` slot is already defined/exported; a later phase (system views
 * + labels) wires it back in via `sidebarSlot={Mail.Sidebar}`.
 */
export function MailLayout() {
  return (
    <AppShellLayout>
      <MillerColumns />
    </AppShellLayout>
  );
}
