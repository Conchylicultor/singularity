import type { FieldColumnMap } from "@plugins/primitives/plugins/data-view/plugins/server-query/server";
import { _mailThreads } from "@plugins/apps/plugins/mail/plugins/mail-core/server";

// Binds each mapped MAIL_INBOX_FIELDS id → its physical `mail_threads` column,
// with the field-type token (resolving the operator→SQL builder) and `nullable`
// for the null-aware keyset seek. `messageCount` binds as `"number"` (the
// registered filter/sort type token — `int` re-declares nothing server-side and
// is sort-only here anyway). Unmapped filter/sort fields are dropped fail-soft by
// the compiler — never a 400.
export const COLUMN_MAP: FieldColumnMap = {
  subject: { col: _mailThreads.subject, type: "text", nullable: true },
  lastMessageAt: { col: _mailThreads.lastMessageAt, type: "date", nullable: true },
  unread: { col: _mailThreads.unread, type: "bool" },
  starred: { col: _mailThreads.starred, type: "bool" },
  important: { col: _mailThreads.important, type: "bool" },
  hasAttachments: { col: _mailThreads.hasAttachments, type: "bool" },
  messageCount: { col: _mailThreads.messageCount, type: "number" },
};
