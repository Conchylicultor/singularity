import { Attachments } from "@plugins/attachments/server";
import { _tasks } from "./tables";

// Task ↔ attachment link. Kept in a separate file from `./schema.ts` because
// that file is transitively reachable from `@plugins/tasks-core/shared` (which
// web code imports); pulling `@plugins/attachments/server` into it would drag
// postgres + db/client into the browser bundle. This file is included in the
// drizzle-kit glob via the `schema*.ts` pattern in `server/drizzle.config.ts`.
export const _taskAttachments = Attachments.defineLink(_tasks);
