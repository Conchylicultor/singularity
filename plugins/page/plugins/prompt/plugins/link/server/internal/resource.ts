import { serveCollection } from "@plugins/network/plugins/live/server";
import { promptBlockTasks } from "../../shared/schemas";
import { promptBlock } from "./tables";

// Server half of the link collection, served from the extension entity (its
// wire columns — `taskId` is the `parent_id` PK). The block-side window filters
// on `block_id` through the `(block_id, created_at)` index (see ./tables.ts);
// the task-side `:rows` point read seeks on the PK, and its point routing
// schedules a write for the one task whose row it named rather than every
// mounted reader.
export const promptBlockTasksServed = serveCollection(promptBlockTasks, {
  from: promptBlock,
});
