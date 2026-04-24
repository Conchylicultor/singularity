import type { ServerPluginDefinition } from "@server/types";
import {
  handleDeleteTargeting,
  handleDeleteTrigger,
  handleDirectEnqueue,
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
  description: "Dummy plugin exercising the events and jobs APIs end-to-end.",
  httpRoutes: {
    "POST /api/events-test/subscribe": handleSubscribe,
    "POST /api/events-test/emit": handleEmit,
    "POST /api/events-test/direct-enqueue": handleDirectEnqueue,
    "GET /api/events-test/log": handleLog,
    "POST /api/events-test/reset": handleReset,
    "DELETE /api/events-test/trigger/:id": handleDeleteTrigger,
    "POST /api/events-test/delete-targeting": handleDeleteTargeting,
    "GET /api/events-test/triggers": handleListTriggers,
    "GET /api/events-test/wait-idle": handleWaitIdle,
  },
} satisfies ServerPluginDefinition;
