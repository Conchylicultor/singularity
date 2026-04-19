import { eq, getTableColumns, sql } from "drizzle-orm";
import { pgView } from "drizzle-orm/pg-core";
import { createSelectSchema } from "drizzle-zod";
import { z } from "zod";
// Cross-plugin FK ref via the leaf `internal/tables` path (not `server/api`)
// to avoid pulling in tasks' views, which back-reference `_conversations`
// and would form an initialization cycle.
import { _attempts } from "@plugins/tasks/server/internal/tables";
import { ConversationModelSchema } from "../model";
import { ConversationStatusSchema } from "../status";
import { _conversations } from "./tables";

// Public view: adds the derived `active` plus the attempt's worktree path
// (convenience for UI consumers — they shouldn't have to subscribe to
// `attempts` just to render the VSCode/Open-App buttons).
export const conversations = pgView("conversations_v").as((qb) =>
  qb
    .select({
      ...getTableColumns(_conversations),
      worktreePath: _attempts.worktreePath,
      taskId: _attempts.taskId,
      active: sql<boolean>`(${_conversations.status} <> 'gone')`.as("active"),
    })
    .from(_conversations)
    .innerJoin(_attempts, eq(_attempts.id, _conversations.attemptId)),
);

export const ConversationSchema = createSelectSchema(_conversations, {
  status: ConversationStatusSchema,
  model: ConversationModelSchema,
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  endedAt: z.coerce.date().nullable(),
}).extend({
  worktreePath: z.string(),
  taskId: z.string(),
  active: z.boolean(),
});
export type Conversation = z.infer<typeof ConversationSchema>;
