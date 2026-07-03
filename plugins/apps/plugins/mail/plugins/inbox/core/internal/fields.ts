// The single shared field vocabulary driving BOTH the web `FieldDef[]` (added
// `value`/`cell` accessors) and the server `FieldColumnMap` (added drizzle
// columns), so the two runtimes can never drift on which dimensions exist or
// what type they are. Plain data only (browser-safe) — no React, no drizzle.
//
// `sender`/`snippet` are display-only (rendered inside the list's `renderRow`),
// NOT fields here — that avoids dead sort/filter axes; the server search covers
// subject/snippet via ilike.
export type MailThreadFieldType = "text" | "date" | "bool" | "int";

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

export const MAIL_INBOX_FIELDS: MailThreadFieldSpec[] = [
  { id: "subject", label: "Subject", type: "text", primary: true, sortable: true, nullable: true },
  { id: "lastMessageAt", label: "Date", type: "date", sortable: true, nullable: true, align: "end" },
  { id: "unread", label: "Unread", type: "bool", filterable: true },
  { id: "starred", label: "Starred", type: "bool", filterable: true },
  { id: "important", label: "Important", type: "bool", filterable: true },
  { id: "hasAttachments", label: "Attachment", type: "bool", filterable: true },
  { id: "messageCount", label: "Messages", type: "int", sortable: true },
];
