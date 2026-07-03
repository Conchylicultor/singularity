import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdInbox } from "react-icons/md";
import { Pane, openPane } from "@plugins/primitives/plugins/pane/web";
import { sidebarNavItem } from "@plugins/primitives/plugins/app-shell/web";
import { Mail } from "@plugins/apps/plugins/mail/plugins/shell/web";
import { inboxPane } from "./panes";

export { inboxPane } from "./panes";

export default {
  description:
    "Mail inbox as a standard DataView: a server-delegated keyset query over mail_threads scoped to the Gmail INBOX, rendered as a Gmail-style list; reachable from the Mail sidebar and the bare /mail landing.",
  contributions: [
    Pane.Register({ pane: inboxPane }),
    Mail.Sidebar({
      id: "inbox",
      ...sidebarNavItem({
        title: "Inbox",
        icon: MdInbox,
        onClick: () => openPane(inboxPane, {}, { mode: "root" }),
      }),
    }),
  ],
} satisfies PluginDefinition;
