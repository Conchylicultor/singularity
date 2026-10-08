import { serveCollection } from "@plugins/network/plugins/live/server";
import { taskCategories } from "../../shared/resources";
import { taskCategoriesServeOptions } from "./serve-options";

// The whole ordered set and its `:rows` point sibling, both routed over
// `tasks_ext_category` (its first routed layout): a category set is an
// entrant (one refill + one `orderOf`), a change a one-row refill, a clear or
// the task's delete (FK cascade) an exit with no load. Persisted to L2, so the
// `{}` snapshot stays current with nobody subscribed.
export const taskCategoriesServed = serveCollection(
  taskCategories,
  taskCategoriesServeOptions,
);
