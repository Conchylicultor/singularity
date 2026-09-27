import { serveCollection } from "@plugins/network/plugins/live/server";
import { taskPreprompts } from "../../shared/schemas";
import { tasksPreprompt } from "./tables";

// Server half of the per-task selection read: the lookup-only collection
// served from the extension entity (`taskId` is its `parent_id` PK; the
// projection is exactly the row schema). The loader reads only the subscribed
// id set, and the `:rows` point routing schedules a select or clear of one
// task's preprompt for that task's tuple alone, never recomputing the whole
// table.
export const taskPrepromptsServed = serveCollection(taskPreprompts, {
  from: tasksPreprompt,
});
