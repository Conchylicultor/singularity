import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { mailThreadsPane } from "./panes";

export { mailThreadsPane } from "./panes";

export default {
  description:
    "The Mail app's one mail surface (/mail/threads): a single DataView over mail_threads whose TABS are the mailboxes — each an authored view instance whose scope is an ordinary, user-editable filter — read as a live segmented scroll of the `mail.threads` collection, scoped to the connected account.",
  contributions: [Pane.Register({ pane: mailThreadsPane })],
  slots: { "mail-threads": mailThreadsPane },
} satisfies PluginDefinition;
