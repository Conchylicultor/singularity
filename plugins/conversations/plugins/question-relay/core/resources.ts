import { liveCollection } from "@plugins/network/plugins/live/core";
import { liveText } from "@plugins/network/plugins/live/plugins/filter/core";
import { PendingQuestionSchema } from "./schemas";

// The OPEN held questions (the server's base `where state = 'open'`), read per
// conversation: answering, releasing or abandoning one is a membership exit.
// The CLI asks one question call at a time, so a conversation holds at most
// one; the small window is a bound, not a page size anyone scrolls.
export const pendingQuestions = liveCollection("question-relay.pending", {
  row: PendingQuestionSchema,
  id: "toolUseId",
  filterable: { conversationId: liveText() },
  sortable: ["createdAt"],
  default: { orderBy: [["createdAt", "asc"]], limit: 5 },
  maxLimit: 20,
});
