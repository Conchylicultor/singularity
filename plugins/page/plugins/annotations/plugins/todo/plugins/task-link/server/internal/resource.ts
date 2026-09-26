import { serveCollection } from "@plugins/network/plugins/live/server";
import { todoTasks } from "../../shared/schemas";
import { todoTask } from "./tables";

// Server half of the per-card link read: the lookup-only collection served from
// the extension entity (its wire columns — `blockId` is the `parent_id` PK). The
// `:rows` point routing schedules a dispatch on one card for that card's tuple
// alone, instead of waking every mounted card to run its own seek.
export const todoTasksServed = serveCollection(todoTasks, { from: todoTask });
