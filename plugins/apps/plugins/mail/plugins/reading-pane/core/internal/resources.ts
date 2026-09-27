import { liveCollection } from "@plugins/network/plugins/live/core";
import { liveText } from "@plugins/network/plugins/live/plugins/filter/core";
import { MailMessageSchema } from "@plugins/apps/plugins/mail/plugins/mail-core/core";

// The messages of the mailbox, as a live collection — the reading pane reads
// one thread's window of it (`useLive(threadMessages, { where: { threadId } })`).
// The default window is the NEWEST 100 (`internalDate desc`, max 500): a
// reading pane most needs a long thread's latest replies, so the pane reverses
// the window for display (oldest→newest) and `loadMore` pages OLDER messages.
// A message with no internal date (rare) sorts last under `desc` — so in a
// thread longer than the window it shows only once the window has grown to it.
//
// The `threadId` filter is immutable (a message never changes threads) and
// `internalDate` is insert-immutable, so an in-place update — a flag flip, a
// body hydration — keeps the window's order signature and ships as one row.
// Bodies are null on the envelope stubs; the pane hydrates each message on
// first expand via the sync plugin's `mailHydrateMessageEndpoint` (cached
// thereafter).
export const threadMessages = liveCollection("mail-thread-messages", {
  row: MailMessageSchema,
  id: "id",
  filterable: { threadId: liveText() },
  sortable: ["internalDate"],
  default: { orderBy: [["internalDate", "desc"]], limit: 100 },
  maxLimit: 500,
});
