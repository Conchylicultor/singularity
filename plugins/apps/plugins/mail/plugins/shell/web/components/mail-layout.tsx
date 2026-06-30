import { MillerColumns } from "@plugins/layouts/plugins/miller/web";
import { AppShellLayout } from "@plugins/primitives/plugins/app-shell/web";
import { Column } from "@plugins/primitives/plugins/css/plugins/column/web";
import { Mail } from "../slots";

/**
 * Mail's main-area layout. Phase 1 has no left-rail content yet, so the shell
 * collapses to a full-surface host and the landing pane fills the width. The
 * `Mail.Sidebar` slot is already defined/exported; a later phase (system views
 * + labels) wires it back in via `sidebarSlot={Mail.Sidebar}`.
 *
 * The `Mail.Banner` strip is a rigid header above the mailbox surface, so a
 * sync-status banner shows on every mail route while `MillerColumns` keeps
 * owning the flexible, scrolling body (`scrollBody={false}`). When no banner is
 * contributed — or every banner renders `null` — the header collapses to zero
 * height and the layout is pixel-identical to a bare `<MillerColumns/>`.
 */
export function MailLayout() {
  return (
    <AppShellLayout>
      <Column
        className="h-full"
        scrollBody={false}
        header={
          <Mail.Banner.Render>{(s) => <s.component />}</Mail.Banner.Render>
        }
        body={<MillerColumns />}
      />
    </AppShellLayout>
  );
}
