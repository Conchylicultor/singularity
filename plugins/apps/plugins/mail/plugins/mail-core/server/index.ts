import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";

// Re-export the physical tables, the attachment-link handle, and the token
// helper so phase-2 sync code can import them from this barrel. Re-exporting a
// plugin's OWN internal files is allowed; only proxying another plugin's
// symbols would violate the boundary rules.
export {
  _mailAccounts,
  _mailSyncState,
  _mailLabels,
  _mailThreads,
  _mailMessages,
  _mailMessageLabels,
  _mailAttachments,
  _mailDrafts,
  _mailOutbox,
} from "./internal/tables";
export { mailDraftAttachments } from "./internal/schema-attachments";
export { requireGmailToken } from "./internal/token";
export type { GmailConnection } from "./internal/token";

export default {
  description:
    "Schema + token wiring for the mail app (accounts, threads, messages, labels, attachments, drafts, sync-state, outbox).",
  contributions: [],
} satisfies ServerPluginDefinition;
