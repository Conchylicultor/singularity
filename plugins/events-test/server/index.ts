import type { ServerPluginDefinition } from "../../../server/src/types";
// Side-effect imports: both register with the events plugin at module load.
import "./internal/tables";
import "./internal/action";
import {
  handleDeleteTargeting,
  handleDeleteTrigger,
  handleEmit,
  handleListTriggers,
  handleLog,
  handleReset,
  handleSubscribe,
  handleWaitIdle,
} from "./internal/handle";

export default {
  id: "events-test",
  name: "Events Test",
  description: "Dummy plugin exercising the events API end-to-end.",
  httpRoutes: {
    "POST /api/events-test/subscribe": handleSubscribe,
    "POST /api/events-test/emit": handleEmit,
    "GET /api/events-test/log": handleLog,
    "POST /api/events-test/reset": handleReset,
    "DELETE /api/events-test/trigger/:id": handleDeleteTrigger,
    "POST /api/events-test/delete-targeting": handleDeleteTargeting,
    "GET /api/events-test/triggers": handleListTriggers,
    "GET /api/events-test/wait-idle": handleWaitIdle,
  },
} satisfies ServerPluginDefinition;
