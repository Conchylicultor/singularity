import {
  bindColumns,
  type FieldColumnMap,
} from "@plugins/primitives/plugins/data-view/plugins/server-query/server";
import { _mailThreads } from "@plugins/apps/plugins/mail/plugins/mail-core/server";
import { MAIL_THREAD_FILTERABLE } from "../../core";

// Binds every MAIL_THREAD_FILTERABLE column → its `mail_threads` column (domain
// copied from the declaration; a declared column with no binding is a tsc
// error), with `nullable` for the null-aware keyset seek. A filter naming
// anything else is refused with a 400 — never dropped.
//
// `labels` binds the jsonb `label_ids` array (the `stringArray` domain's
// containment ops every mailbox tab's authored filter lowers to). It is
// intentionally absent from the sortable set: a jsonb array has no keyset-usable
// order.
export const COLUMN_MAP: FieldColumnMap = bindColumns(MAIL_THREAD_FILTERABLE, {
  subject: { col: _mailThreads.subject, nullable: true },
  snippet: { col: _mailThreads.snippet, nullable: true },
  lastMessageAt: { col: _mailThreads.lastMessageAt, nullable: true },
  labels: { col: _mailThreads.labelIds },
  unread: { col: _mailThreads.unread },
  starred: { col: _mailThreads.starred },
  important: { col: _mailThreads.important },
  hasAttachments: { col: _mailThreads.hasAttachments },
  messageCount: { col: _mailThreads.messageCount },
});
