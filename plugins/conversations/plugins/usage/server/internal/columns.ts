import { serveColumns } from "@plugins/network/plugins/live/server";
import {
  allConversationsUsage,
  conversationHistoryUsage,
} from "../../shared/columns";
import { conversationUsage } from "./tables";

// The usage columns of both conversation lists, read through the usage
// extension: LEFT, 1:1 on the conversation id. A sync's write refills exactly
// that conversation, in the list tuples that read the join — and loads nothing
// in a tuple that only projects it and does not hold the conversation.
export const allConversationsUsageServed = serveColumns(allConversationsUsage, {
  join: conversationUsage.join("usage"),
});
export const conversationHistoryUsageServed = serveColumns(
  conversationHistoryUsage,
  { join: conversationUsage.join("usage") },
);
