import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdMoveToInbox } from "react-icons/md";
import { Mail } from "@plugins/apps/plugins/mail/plugins/shell/web";
import { MailboxNav } from "./components/mailbox-nav";

export default {
  description:
    "Mailbox sidebar nav for the Mail app: the system-view list (Inbox, Starred, …) and the live user-label list, each row navigating the thread-list column with an unread-count badge and active highlight. Owns the labels + per-view unread-count live resources (server).",
  contributions: [
    Mail.Sidebar({
      id: "mailbox",
      title: "Mailboxes",
      icon: MdMoveToInbox,
      component: MailboxNav,
    }),
  ],
} satisfies PluginDefinition;
