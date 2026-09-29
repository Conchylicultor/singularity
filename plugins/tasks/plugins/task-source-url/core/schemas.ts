import { z } from "zod";
import { textField } from "@plugins/fields/plugins/text/plugins/config/core";
import { defineExtensionShape } from "@plugins/infra/plugins/entity-extensions/core";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

// The page a task was filed from, stored in the `tasks_ext_source_url`
// entity-extension table (1:1 per task). Written once, when the draft form's
// "Attach page URL" is on; never edited, and never inherited by subtasks.
export const taskSourceUrlShape = defineExtensionShape({
  key: "taskId",
  fields: { url: textField() },
});

const AttemptSourceUrlSchema = z.object({ url: z.string().nullable() });
export type AttemptSourceUrl = z.infer<typeof AttemptSourceUrlSchema>;

// Keyed by attempt: an attempt id is its worktree, which is what a caller
// opening the app holds. The stored URL wins; without one, the url of the
// first `<ui-context>` in the task's prompt. `url: null` = neither exists.
export const getAttemptSourceUrl = defineEndpoint({
  route: "GET /api/task-source-url/by-attempt/:attemptId",
  response: AttemptSourceUrlSchema,
});
