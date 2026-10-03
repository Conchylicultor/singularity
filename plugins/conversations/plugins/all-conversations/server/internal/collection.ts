import { serveCollection } from "@plugins/network/plugins/live/server";
import {
  _conversations,
  conversationOwnerColumns,
  conversationOwnerJoins,
} from "@plugins/tasks/plugins/tasks-core/server";
import { allConversations, conversationHistory } from "../../core";
import { allConversationsDefaults } from "./defaults";

// Both lists read `_conversations` (never `conversations_v`: a routed compile
// reads base tables) with their owners joined — attempt, then task — so each
// table they read routes itself:
//
// - `conversations`: identity, gated on the projected columns + `attempt_id`
//   (a poller's `waitingFor` / `lastViewedAt` write reaches neither list);
// - `attempts`: a reverse route on its pk (`{id, task_id, worktree_path}`);
// - `tasks`: a reverse route probed through `attempts` (`{id, title}`) — a
//   rename refills that task's conversations a window holds (value role), or,
//   for a tuple that searches or filters `taskTitle`, re-decides membership.

/** The All-conversations list. */
export const allConversationsServed = serveCollection(allConversations, {
  from: _conversations,
  joins: conversationOwnerJoins,
  columns: conversationOwnerColumns,
  defaults: allConversationsDefaults,
});

/** The sidebar History list: every conversation, system ones included. */
export const conversationHistoryServed = serveCollection(conversationHistory, {
  from: _conversations,
  joins: conversationOwnerJoins,
  columns: conversationOwnerColumns,
});
