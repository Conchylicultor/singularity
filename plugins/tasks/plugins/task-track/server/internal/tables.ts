import { _tasks } from "@plugins/tasks/plugins/tasks-core/server";
import { defineExtension } from "@plugins/infra/plugins/entity-extensions/server";
import { taskTrackShape } from "../../shared/resources";

// Per-task track: presence = a non-default track (see the shape). Absence =
// main, so no existing task needs a backfill and no `createTask` call site
// needs to know tracks exist.
export const tasksTrack = defineExtension(_tasks, "track", taskTrackShape);
// Re-exported so drizzle-kit discovers the underlying pgTable.
export const _tasksTrackExt = tasksTrack.table;
