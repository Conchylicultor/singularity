import type { ReactNode } from "react";
import { RelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import type { FieldDef, FieldValue } from "@plugins/primitives/plugins/data-view/web";
import type { MailThread } from "@plugins/apps/plugins/mail/plugins/mail-core/core";
import { MAIL_INBOX_FIELDS } from "../../core";

// Comparable projection for one field id. Drives the toolbar sort/filter pills
// (search/filter/sort actually run server-side; this powers the chrome). The
// list body itself is fully owned by `renderRow` (InboxRow), so no cell is
// needed for display — only the `date` cell exists so a future non-renderRow
// consumer of these fields still shows a friendly date.
function fieldValue(t: MailThread, id: string): FieldValue {
  switch (id) {
    case "subject":
      return t.subject;
    case "lastMessageAt":
      return t.lastMessageAt;
    case "unread":
      return t.unread;
    case "starred":
      return t.starred;
    case "important":
      return t.important;
    case "hasAttachments":
      return t.hasAttachments;
    case "messageCount":
      return t.messageCount;
    default:
      return null;
  }
}

function cellFor(id: string, type: string): ((t: MailThread) => ReactNode) | undefined {
  if (type === "date") {
    return (t: MailThread) => {
      const v = fieldValue(t, id);
      return v instanceof Date ? <RelativeTime date={v} /> : null;
    };
  }
  return undefined;
}

// The web `FieldDef[]`, derived from the shared MAIL_INBOX_FIELDS vocabulary so
// it can never drift from the server's FieldColumnMap.
export const inboxFieldDefs: FieldDef<MailThread>[] = MAIL_INBOX_FIELDS.map((spec) => ({
  id: spec.id,
  label: spec.label,
  type: spec.type,
  primary: spec.primary,
  sortable: spec.sortable,
  filterable: spec.filterable,
  align: spec.align,
  value: (t: MailThread) => fieldValue(t, spec.id),
  cell: cellFor(spec.id, spec.type),
}));
