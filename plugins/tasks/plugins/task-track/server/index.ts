import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { putTaskTrack } from "../core";
import { taskTracksServed } from "./internal/resource";
import { handlePutTaskTrack } from "./internal/routes";

export {
  getTaskTrack,
  setTaskTrack,
  listSidequestIds,
} from "./internal/mutations";

export default {
  description:
    "Owns the tasks_ext_track side-table: the per-task track (absence = main, a row = sidequest), its live collection (window for the task list, point reads for one task), and the endpoint that switches a task's track.",
  contributions: [...taskTracksServed.declare],
  httpRoutes: {
    [putTaskTrack.route]: handlePutTaskTrack,
  },
} satisfies ServerPluginDefinition;
