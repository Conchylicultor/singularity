import type { z } from "zod";
import { liveCollection } from "@plugins/network/plugins/live/core";
import { enumTextField } from "@plugins/fields/plugins/text/plugins/config/core";
import { defineExtensionShape } from "@plugins/infra/plugins/entity-extensions/core";
import { STORED_TASK_TRACKS } from "../core";

// One row per NON-default-track task, stored in the `tasks_ext_track`
// entity-extension table (1:1 per task), which `server/internal/tables.ts`
// builds from this shape. The column only takes the stored tracks (today
// `sidequest`): absence of a row IS the main track, so `main` has no spelling
// here. `createdAt` is on the wire because it is the window's order key (a
// `sortable` column must be a row field).
export const taskTrackShape = defineExtensionShape({
  key: "taskId",
  fields: { track: enumTextField(STORED_TASK_TRACKS) },
  wireTimestamps: ["createdAt"],
});
export const TaskTrackRowSchema = taskTrackShape.schema;
export type TaskTrackRow = z.infer<typeof TaskTrackRowSchema>;

// The stored tracks, read two ways from one declaration:
//
// - `useLiveRow(taskTracks, taskId)` — the exact answer for ONE task (the task
//   detail's Track row, the conversation header chip). `found: false` is main.
// - `useLive(taskTracks)` — the bounded default WINDOW, for the task list's
//   `track` field, which must project a track for EVERY row the tasks DataView
//   groups and filters over. Naming every task id would be O(tasks); what is
//   bounded here is the set of non-main tasks, so the window bounds the right
//   thing (the same reasoning as `pages-starred`). The list reader grows the
//   window while it is full; past `maxLimit` sidequests the oldest-filed ones
//   read as main in the LIST only — the single-task reads stay exact.
//
// Preloaded (`boot-and-keep`) so the tasks list never paints every row as main
// and then flips: the boot snapshot hydrates the default window before first
// paint, and the cache stays resident for surfaces that mount late.
export const taskTracks = liveCollection("task-tracks", {
  row: TaskTrackRowSchema,
  id: "taskId",
  filterable: {},
  sortable: ["createdAt"],
  default: { orderBy: [["createdAt", "desc"]], limit: 500 },
  maxLimit: 2000,
  preload: "boot-and-keep",
});
