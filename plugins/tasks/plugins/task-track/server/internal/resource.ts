import { serveCollection } from "@plugins/network/plugins/live/server";
import { taskTracks } from "../../shared/resources";
import { tasksTrack } from "./tables";

// Served from the extension handle (`taskId` is the `parent_id` PK, `createdAt`
// a `wireTimestamps` entry of the shape; the projection is exactly the row
// schema). Marking a task a sidequest is a window membership ENTRY and moving
// it back to main a membership EXIT — incremental deltas, never a
// whole-collection recompute. The `:rows` point sibling answers the
// single-task reads.
export const taskTracksServed = serveCollection(taskTracks, {
  from: tasksTrack,
});
