import { Attachments } from "@plugins/infra/plugins/attachments/server";
import { _conversations, _tasks } from "./tables";

// Task ↔ attachment link. Kept in a separate file from `./schema.ts` because
// that file is transitively reachable from `@plugins/tasks-core/shared` (which
// web code imports); pulling `@plugins/infra/plugins/attachments/server` into it would drag
// postgres + db/client into the browser bundle. This file is included in the
// drizzle-kit glob via the `schema*.ts` pattern in `server/drizzle.config.ts`.
export const _taskAttachments = Attachments.defineLink(_tasks);

// Conversation ↔ attachment link. Pasted images in the prompt-input upload
// to /api/attachments and surface as `![](/api/attachments/<id>)` markdown
// refs in the draft. When a turn submits, the conversations server records a
// link row per referenced id so the orphan sweep leaves them alone while the
// conversation is alive.
export const _conversationAttachments = Attachments.defineLink(_conversations);
