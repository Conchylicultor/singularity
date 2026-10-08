import { tasksCategory } from "./tables";

// How `taskCategories` binds to its table — the ONE spelling both the served
// collection (`./resource.ts`) and the runtime oracle
// (`./task-categories-oracle.test.ts`, which compiles it against a throwaway
// database) read, so the oracle cannot drift from what ships. Every row field
// is a wire column of the extension (`taskId` its `parent_id` key).
export const taskCategoriesServeOptions = { from: tasksCategory } as const;
