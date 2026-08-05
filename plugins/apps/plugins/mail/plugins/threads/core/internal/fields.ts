// The single shared field vocabulary driving BOTH the web `FieldDef[]` (added
// `value`/`values`/`cell`/`options` accessors) and the server `FieldColumnMap`
// (added drizzle columns), so the two runtimes can never drift on which
// dimensions exist or what type they are. Plain data only (browser-safe) — no
// React, no drizzle.
//
// `sender`/`snippet` are display-only (rendered inside the list's `renderRow`),
// NOT fields here — that avoids dead sort/filter axes; the server search covers
// subject/snippet via ilike.
export type MailThreadFieldType = "text" | "date" | "bool" | "int" | "tags";

export interface MailThreadFieldSpec {
  id: string;
  label: string;
  type: MailThreadFieldType;
  /** Tree/primary label field (the one rendered as the row title). */
  primary?: boolean;
  /** Sortable in the toolbar Sort pill (also the keyset-sortable set). */
  sortable?: boolean;
  /** Filterable in the toolbar Filter pill. */
  filterable?: boolean;
  /** Column may be NULL — drives null-aware keyset seek terms server-side. */
  nullable?: boolean;
  /** Table/list trailing alignment for this field. */
  align?: "start" | "end" | "center";
}

// `labels` is the axis every mailbox tab is expressed on: "Inbox" is the authored
// view whose filter is `labels contains INBOX`, and the user edits that rule like
// any other. `starred` / `important` back the two flag tabs off their
// denormalized rollup columns. These ids are the contract the authored view rows
// in `config/apps/mail/threads/mail-threads.jsonc` are written against — a rename
// here silently drops those rules (an unmapped fieldId is dropped fail-soft), so
// rename config and code together.
//
// `labels` is deliberately NOT sortable — a jsonb array has no natural order, so
// a keyset sort key over it would be meaningless.
export const MAIL_THREAD_FIELDS: MailThreadFieldSpec[] = [
  { id: "subject", label: "Subject", type: "text", primary: true, sortable: true, nullable: true },
  { id: "lastMessageAt", label: "Date", type: "date", sortable: true, nullable: true, align: "end" },
  { id: "labels", label: "Labels", type: "tags", filterable: true },
  { id: "unread", label: "Unread", type: "bool", filterable: true },
  { id: "starred", label: "Starred", type: "bool", filterable: true },
  { id: "important", label: "Important", type: "bool", filterable: true },
  { id: "hasAttachments", label: "Attachment", type: "bool", filterable: true },
  { id: "messageCount", label: "Messages", type: "int", sortable: true },
];
