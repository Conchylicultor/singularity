import type { MailThreadColumn } from "./collection";

// The shared field vocabulary: the web `FieldDef[]` (which adds the
// `value`/`values`/`cell`/`options` accessors) and the authored-views test both
// read it, and each field names the `mailThreads` column it sorts and filters
// by — so a field can never lower to a column the collection does not declare.
// Plain data only (browser-safe) — no React.
//
// `sender`/`snippet` are display-only (rendered inside the list's `renderRow`),
// NOT fields here — that avoids dead sort/filter axes; the search box covers
// subject/snippet (the live source's `searchable`).
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
  /**
   * The `mailThreads` column this field sorts and filters by, when its id is
   * not that column's name (`labels` → `labelIds`). Field ids are the persisted
   * vocabulary (the authored mailbox rules say `labels`), so they stay.
   */
  column?: MailThreadColumn;
  /** Table/list trailing alignment for this field. */
  align?: "start" | "end" | "center";
}

// `labels` is the axis every mailbox tab is expressed on: "Inbox" is the authored
// view whose filter is `labels contains INBOX`, and the user edits that rule like
// any other. `starred` / `important` back the two flag tabs off their
// denormalized rollup columns. These ids are the contract the authored view rows
// in `config/apps/mail/threads/mail-threads.jsonc` are written against — a rename
// here leaves those rules dangling (a rule on an unknown field constrains
// nothing), so rename config and code together; `web/__tests__/authored-views`
// lowers every authored tab and fails if one no longer does.
//
// `labels` is deliberately NOT sortable — a jsonb array has no natural order, so
// a keyset sort key over it would be meaningless.
export const MAIL_THREAD_FIELDS: MailThreadFieldSpec[] = [
  {
    id: "subject",
    label: "Subject",
    type: "text",
    primary: true,
    sortable: true,
  },
  {
    id: "lastMessageAt",
    label: "Date",
    type: "date",
    sortable: true,
    align: "end",
  },
  {
    id: "labels",
    label: "Labels",
    type: "tags",
    filterable: true,
    column: "labelIds",
  },
  { id: "unread", label: "Unread", type: "bool", filterable: true },
  { id: "starred", label: "Starred", type: "bool", filterable: true },
  { id: "important", label: "Important", type: "bool", filterable: true },
  { id: "hasAttachments", label: "Attachment", type: "bool", filterable: true },
  { id: "messageCount", label: "Messages", type: "int", sortable: true },
];
