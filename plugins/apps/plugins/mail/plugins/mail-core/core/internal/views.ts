// The mailbox's system views + the filter descriptor each maps to. A closed set
// both runtimes need (the server compiles a filter to SQL, the web renders its
// icon + navigates), so it lives as plain data in `core/` per the project's
// "closed list → plain data, not a slot" guidance — NOT a contribution slot.
//
// A user label is addressed as the view string `label:<labelId>`; a system view
// by its bare id (`inbox`, `sent`, …). `parseMailView` turns either into a
// `MailViewFilter`, the single shape the thread-query compiler understands.

/** How a view selects threads. Field- and SQL-agnostic (web-safe) plain data. */
export type MailViewFilter =
  /** Threads whose `label_ids` JSONB array contains `labelId` (system or user). */
  | { kind: "label"; labelId: string }
  /** Threads whose denormalized boolean rollup column is true. */
  | { kind: "flag"; flag: "starred" | "important" }
  /** Gmail "All Mail": everything except Spam and Trash. */
  | { kind: "allMail" };

export interface MailSystemView {
  id: string;
  title: string;
  filter: MailViewFilter;
}

/**
 * System views in sidebar order. Mirrors Gmail's default left rail. `starred`
 * and `important` read the denormalized boolean columns; the rest are label
 * containment except `all` (All Mail = not spam, not trash).
 */
export const MAIL_SYSTEM_VIEWS: MailSystemView[] = [
  { id: "inbox", title: "Inbox", filter: { kind: "label", labelId: "INBOX" } },
  { id: "starred", title: "Starred", filter: { kind: "flag", flag: "starred" } },
  { id: "important", title: "Important", filter: { kind: "flag", flag: "important" } },
  { id: "sent", title: "Sent", filter: { kind: "label", labelId: "SENT" } },
  { id: "drafts", title: "Drafts", filter: { kind: "label", labelId: "DRAFT" } },
  { id: "all", title: "All Mail", filter: { kind: "allMail" } },
  { id: "spam", title: "Spam", filter: { kind: "label", labelId: "SPAM" } },
  { id: "trash", title: "Trash", filter: { kind: "label", labelId: "TRASH" } },
];

/** The view shown at bare `/mail` (index redirects here once the mailbox is ready). */
export const DEFAULT_MAIL_VIEW = "inbox";

const SYSTEM_VIEW_BY_ID = new Map(MAIL_SYSTEM_VIEWS.map((v) => [v.id, v]));

/** The `label:` prefix for a user-label view string (`label:Label_12`). */
const LABEL_VIEW_PREFIX = "label:";

/** Build the view string that addresses a user label. */
export function labelViewId(labelId: string): string {
  return `${LABEL_VIEW_PREFIX}${labelId}`;
}

/** If `view` addresses a user label (`label:<id>`), return its label id, else null. */
export function mailViewLabelId(view: string): string | null {
  return view.startsWith(LABEL_VIEW_PREFIX)
    ? view.slice(LABEL_VIEW_PREFIX.length)
    : null;
}

/**
 * Resolve a view string to its filter. A known system id → its filter; a
 * `label:<id>` string → a label filter; anything unknown → `null` so the caller
 * can fall back to the default view rather than silently querying nothing.
 */
export function parseMailView(view: string): MailViewFilter | null {
  const system = SYSTEM_VIEW_BY_ID.get(view);
  if (system) return system.filter;
  const labelId = mailViewLabelId(view);
  if (labelId) return { kind: "label", labelId };
  return null;
}
