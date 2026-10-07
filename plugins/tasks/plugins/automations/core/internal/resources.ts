import { z } from "zod";
import { liveCollection, liveValue } from "@plugins/network/plugins/live/core";
import { liveText } from "@plugins/network/plugins/live/plugins/filter/core";
import { dateField } from "@plugins/fields/plugins/date/plugins/config/core";
import { jsonField } from "@plugins/fields/plugins/json/plugins/config/core";
import { textField } from "@plugins/fields/plugins/text/plugins/config/core";
import { defineExtensionShape } from "@plugins/infra/plugins/entity-extensions/core";
import { AutomationEntrySchema } from "./entry";

/**
 * Every registered automation. External and bounded by the declared set (the
 * process holds the registry); pushed when an automation files a task or one of
 * its tasks changes status, since `openTaskId` moves then.
 */
export const automationsCatalog = liveValue("automations.catalog", {
  schema: z.array(AutomationEntrySchema),
});

// Where a task came from: one row per task an automation filed, in the
// `tasks_ext_origin` side-table. A row is the proof; a task with none was filed
// by a person (or an agent acting for one). `sourceKeys` are the sources the
// filing covered (the updater ids a dependency upgrade batched); `filedAt` is
// when it was filed — for a task adopted from before origins were recorded, the
// task's own creation time.
export const taskOriginShape = defineExtensionShape({
  key: "taskId",
  fields: {
    automationId: textField(),
    sourceKeys: jsonField({ schema: z.array(z.string()), default: [] }),
    filedAt: dateField(),
  },
});
export const AutomationTaskRowSchema = taskOriginShape.schema;
export type AutomationTaskRow = z.infer<typeof AutomationTaskRowSchema>;

/**
 * The tasks automations filed, newest first. One automation's history is
 * `useLive(automationTasks, { where: { automationId } })`; one task's origin is
 * `useLiveRow(automationTasks, taskId)` (`found: false` ⇒ not an automation's).
 *
 * The task list's Automation field reads the whole window (up to `maxLimit`),
 * since it needs an origin for EVERY task row: naming every task id would be
 * O(tasks), while what is bounded here is the set of automated tasks (the
 * `task-tracks` reasoning). Past `maxLimit` rows, the oldest-filed read as
 * filed by a person in the LIST only — the single-task reads stay exact.
 */
export const automationTasks = liveCollection("automations.tasks", {
  row: AutomationTaskRowSchema,
  id: "taskId",
  filterable: { automationId: liveText() },
  sortable: ["filedAt"],
  default: { orderBy: [["filedAt", "desc"]], limit: 50 },
  maxLimit: 2000,
});
