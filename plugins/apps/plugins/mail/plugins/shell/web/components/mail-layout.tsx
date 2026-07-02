import { MdMail } from "react-icons/md";
import { MillerColumns } from "@plugins/layouts/plugins/miller/web";
import { AppShellLayout } from "@plugins/primitives/plugins/app-shell/web";
import { Column } from "@plugins/primitives/plugins/css/plugins/column/web";
import { Inline } from "@plugins/primitives/plugins/css/plugins/inline/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Mail } from "../slots";

/**
 * Mail's main-area layout: the app shell wraps the `Mail.Sidebar` left rail
 * (the mailbox nav — system views + labels — from the `mailbox` plugin, plus the
 * Search entry from the search plugin) around the Miller body. The sidebar header
 * carries a small Mail brand.
 *
 * The `Mail.Banner` strip is a rigid header above the mailbox surface, so a
 * sync-status banner shows on every mail route while `MillerColumns` keeps
 * owning the flexible, scrolling body (`scrollBody={false}`). When no banner is
 * contributed — or every banner renders `null` — the header collapses to zero
 * height and the body is pixel-identical to a bare `<MillerColumns/>`.
 */
export function MailLayout() {
  return (
    <AppShellLayout
      sidebarSlot={Mail.Sidebar}
      header={
        <Inline gap="xs">
          <MdMail className="icon-auto" />
          <Text variant="label" className="font-semibold">
            Mail
          </Text>
        </Inline>
      }
    >
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
