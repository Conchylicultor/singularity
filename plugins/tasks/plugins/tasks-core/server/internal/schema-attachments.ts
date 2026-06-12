import { Attachments } from "@plugins/infra/plugins/attachments/server";
import { _conversations, _tasks } from "./tables";

// Task ↔ attachment link. Kept in a separate file from `./schema.ts` because
// that file is transitively reachable from `@plugins/tasks/plugins/tasks-core/core` (which
// web code imports); pulling `@plugins/infra/plugins/attachments/server` into it would drag
// postgres + db/client into the browser bundle. This file is included in the
// drizzle-kit glob via the `schema*.ts` pattern in `server/drizzle.config.ts`.
export const taskAttachments = Attachments.defineLink(_tasks);
export const conversationAttachments = Attachments.defineLink(_conversations);
// Re-export the underlying pgTable so drizzle-kit's schema glob picks it up.
// The leading `_` and the `internal/` location keep cross-plugin imports
// impossible — only the handle is barrel-exported.
export const _taskAttachmentsTable = taskAttachments.table;
export const _conversationAttachmentsTable = conversationAttachments.table;
