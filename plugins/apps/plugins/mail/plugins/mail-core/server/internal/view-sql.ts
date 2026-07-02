import { sql, type SQL } from "drizzle-orm";
import type { MailViewFilter } from "../../core";
import { _mailThreads } from "./tables";

// Compile a mailbox view filter to a Drizzle SQL predicate over `mail_threads`.
// The single source of truth shared by the thread-list query (windowed page) and
// the sidebar's per-view unread counts, so the two can never disagree on what
// "Inbox" or a label view means.
//
// `label` uses JSONB containment on the denormalized `label_ids` array (INBOX,
// SENT, a user `Label_*`, …); `flag` reads a denormalized boolean rollup column;
// `allMail` is Gmail's "All Mail" = everything except Spam and Trash. Label ids
// are Gmail-issued (`[A-Z_]+` / `Label_<n>`), never user input, but we still pass
// them as a JSON parameter rather than string-splicing.
export function mailViewFilterSql(filter: MailViewFilter): SQL {
  switch (filter.kind) {
    case "label":
      return sql`${_mailThreads.labelIds} @> ${JSON.stringify([filter.labelId])}::jsonb`;
    case "flag":
      return filter.flag === "starred"
        ? sql`${_mailThreads.starred} = true`
        : sql`${_mailThreads.important} = true`;
    case "allMail":
      return sql`NOT (${_mailThreads.labelIds} @> '["SPAM"]'::jsonb OR ${_mailThreads.labelIds} @> '["TRASH"]'::jsonb)`;
  }
}
