import {
  Resource,
  type ServerPluginDefinition,
} from "@plugins/framework/plugins/server-core/core";
import { ExcludeFromFork } from "@plugins/database/plugins/admin/server";
import { mailLabelsServerResource } from "./internal/labels-resource";
import {
  _mailMessages,
  _mailThreads,
  _mailMessageLabels,
  _mailAttachments,
} from "./internal/tables";

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
export { resolveMailAccountId } from "./internal/account";
export { requireGmailToken } from "./internal/token";
export type { GmailConnection } from "./internal/token";
export { mailLabelsServerResource } from "./internal/labels-resource";

export default {
  description:
    "Schema + token wiring for the mail app (accounts, threads, messages, labels, attachments, drafts, sync-state, outbox), plus the shared user-labels live resource.",
  contributions: [
    Resource.Declare(mailLabelsServerResource),
    // The mailbox corpus. Gmail sync is main-only, so a forked worktree neither
    // needs these rows nor would ever re-populate them — and at ~845 MB they
    // used to dominate the fork. These four exclusions were previously a
    // hardcoded list of table-name strings inside the fork itself, which the
    // database plugin had no business knowing; they live here now, with the
    // plugin that owns the tables.
    ExcludeFromFork({
      table: _mailMessages,
      reason:
        "Gmail corpus; sync is main-only, so a worktree never reads or re-populates it.",
    }),
    ExcludeFromFork({
      table: _mailThreads,
      reason:
        "Gmail corpus; sync is main-only, so a worktree never reads or re-populates it.",
    }),
    ExcludeFromFork({
      table: _mailMessageLabels,
      reason:
        "Gmail corpus; sync is main-only, so a worktree never reads or re-populates it.",
    }),
    ExcludeFromFork({
      table: _mailAttachments,
      reason:
        "Gmail corpus; sync is main-only, so a worktree never reads or re-populates it.",
    }),
  ],
} satisfies ServerPluginDefinition;
