import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { mailThreadsPane } from "./panes";

export { mailThreadsPane } from "./panes";

export default {
  description:
    "The Mail app's one mail surface (/mail/threads): a single DataView over mail_threads whose TABS are the mailboxes — each an authored view instance whose scope is an ordinary, user-editable filter travelling the standard server-delegated keyset query path.",
  contributions: [Pane.Register({ pane: mailThreadsPane })],
} satisfies PluginDefinition;
