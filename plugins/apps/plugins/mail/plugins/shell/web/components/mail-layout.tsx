import { MillerColumns } from "@plugins/layouts/plugins/miller/web";
import { AppShellLayout } from "@plugins/primitives/plugins/app-shell/web";
import { Column } from "@plugins/primitives/plugins/css/plugins/column/web";
import { Mail } from "../slots";

/**
 * Mail's main-area layout. The `Mail.Sidebar` slot hosts the left-rail entries
 * (Search today; system views + labels in a later phase); the search plugin
 * contributes its Search entry there.
 *
 * The `Mail.Banner` strip is a rigid header above the mailbox surface, so a
 * sync-status banner shows on every mail route while `MillerColumns` keeps
 * owning the flexible, scrolling body (`scrollBody={false}`). When no banner is
 * contributed — or every banner renders `null` — the header collapses to zero
 * height and the layout is pixel-identical to a bare `<MillerColumns/>`.
 */
export function MailLayout() {
  return (
    <AppShellLayout sidebarSlot={Mail.Sidebar}>
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
