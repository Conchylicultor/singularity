import type { z } from "zod";
import {
  liveCollection,
  type WithContributedColumns,
} from "@plugins/network/plugins/live/core";
import { ConversationSchema } from "@plugins/tasks/plugins/tasks-core/core";
import { CONVERSATION_FILTERABLE, CONVERSATION_SORTABLE } from "./fields";

/**
 * One row of a conversation LIST (All-conversations, sidebar History): what the
 * lists render, sort, filter and search — the conversation's own columns plus
 * its owners' (`worktreePath`, `taskId`, and the task's current `taskTitle`).
 *
 * It leaves out what no list reads — `active`, `waitingFor`, `lastViewedAt`,
 * `claudeSessionId`, `closeRequested`, `hibernatedAt`, `attemptId` — so the
 * tmux poller's `waitingFor` / `lastViewedAt` writes fall outside every list's
 * route gate and load nothing.
 */
export const ConversationListRowSchema = ConversationSchema.pick({
  id: true,
  title: true,
  status: true,
  model: true,
  kind: true,
  runtime: true,
  spawnedBy: true,
  createdAt: true,
  updatedAt: true,
  endedAt: true,
  worktreePath: true,
  taskId: true,
  taskTitle: true,
});
export type ConversationListRow = z.infer<typeof ConversationListRowSchema>;

/**
 * A row as the two live lists deliver it: the list row plus every contributed
 * column under `$columns` (both collections are `contributed: true`). What a
 * field extension of either list is typed over.
 */
export type ConversationListLiveRow =
  WithContributedColumns<ConversationListRow>;

// The two lists share one shape; each is its own collection because a
// collection's `columnScope` is the one DataView surface whose custom columns
// sort and filter it (asserted equal to the surface's `storageKey` at mount).
const CONVERSATION_LIST_DEFAULT = {
  orderBy: [["createdAt", "desc"]],
  limit: 100,
} as const;
const CONVERSATION_LIST_MAX_LIMIT = 500;

/**
 * The All-conversations pane's list: every conversation, newest first, read as
 * a segmented scroll and kept fresh by the routed change feed — a
 * conversation write refills that row, an attempt's worktree / task move
 * refills its conversations, a task rename refills the task's conversations a
 * window holds. System conversations are hidden by a DEFAULT scope (served
 * with `defaults: [{ unless: "kind", … }]`): a view that filters on Kind gets
 * exactly what it asks for, system rows included.
 */
export const allConversations = liveCollection("conversations.all", {
  row: ConversationListRowSchema,
  id: "id",
  filterable: CONVERSATION_FILTERABLE,
  sortable: CONVERSATION_SORTABLE,
  default: CONVERSATION_LIST_DEFAULT,
  maxLimit: CONVERSATION_LIST_MAX_LIMIT,
  scroll: true,
  columnScope: "all-conversations",
  // Other plugins' columns (conversations/usage: cost, tokens, agents) sort
  // and filter it too, under `$columns.<contributor>`.
  contributed: true,
});

/**
 * The sidebar History list (a source of the merged `conversations-sidebar`
 * DataView): every conversation, system ones included — the authored "Hide
 * system" filter preset is how a view drops them. Same shape and routes as
 * {@link allConversations}, no default scope.
 */
export const conversationHistory = liveCollection("conversations.history", {
  row: ConversationListRowSchema,
  id: "id",
  filterable: CONVERSATION_FILTERABLE,
  sortable: CONVERSATION_SORTABLE,
  default: CONVERSATION_LIST_DEFAULT,
  maxLimit: CONVERSATION_LIST_MAX_LIMIT,
  scroll: true,
  columnScope: "conversations-sidebar",
  contributed: true,
});
