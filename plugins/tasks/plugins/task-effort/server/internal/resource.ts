import { serveCollection } from "@plugins/network/plugins/live/server";
import { taskEfforts } from "../../shared/schemas";
import { tasksEffort } from "./tables";

// Server half of the per-task mode read: the lookup-only collection served
// from the extension entity (`taskId` is its `parent_id` PK; the projection is
// exactly the row schema). The loader reads only the subscribed id set, and
// the `:rows` point routing schedules a set or clear of one task's mode for
// that task's tuple alone, never recomputing the whole table.
export const taskEffortsServed = serveCollection(taskEfforts, {
  from: tasksEffort,
});
