import type { ServerPluginDefinition } from "@server/types";
// Side-effect import: registers the `events.dispatch` job at module load so
// it's in `jobRegistry` before any `emit()` call happens post-boot.
import "./internal/dispatch-job";
// Side-effect import: installs the events-side implementation of the durable
// hooks (`ctx.waitFor` / `ctx.sleep` trigger registration) on the jobs
// plugin. Keeping the hook installer here avoids jobs → events edges that
// would close the plugin DAG (events already imports jobs).
import "./internal/install-jobs-hooks";
import {
  handleListEmissions,
  handleListTriggers,
  handleDeleteTrigger,
  handlePatchTrigger,
} from "./internal/handle";

export { defineTriggerEvent } from "./internal/event";
export type {
  DefineTriggerEventSpec,
  EventHandle,
  EventSource,
  FilterSlot,
} from "./internal/event";
export { triggerTableRegistry } from "./internal/registry";
export { _event_emissions, EMISSIONS_CAP } from "./internal/tables";
export {
  deleteTrigger,
  deleteTriggersFor,
  trigger,
  triggerByName,
} from "./internal/trigger";
export type { TriggerByNameSpec, TriggerSpec } from "./internal/trigger";

export default {
  id: "events",
  name: "Events",
  description:
    "Event→job bindings layered on @plugins/jobs. Plugins declare events with typed filter columns via defineTriggerEvent, subscribers bind jobs via trigger().",
  httpRoutes: {
    "GET /api/events/emissions": handleListEmissions,
    "GET /api/events/triggers": handleListTriggers,
    "DELETE /api/events/triggers/:id": handleDeleteTrigger,
    "PATCH /api/events/triggers/:id": handlePatchTrigger,
  },
} satisfies ServerPluginDefinition;
