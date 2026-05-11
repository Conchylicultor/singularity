import type { ServerPluginDefinition } from "@server/types";
import { Resource } from "@server/resources";
import { eventsDispatchJob } from "./internal/dispatch-job";
import { jobsHooksRegistration } from "./internal/install-jobs-hooks";
import {
  handleListEmissions,
  handleListTriggers,
  handleDeleteTrigger,
  handlePatchTrigger,
} from "./internal/handle";
import {
  eventEmissionsResource,
  eventTriggersResource,
} from "./internal/resources";

export { defineTriggerEvent } from "./internal/event";
export type {
  DefineTriggerEventSpec,
  EmitTx,
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
  UNSAFE_triggerByName,
} from "./internal/trigger";
export type {
  TriggerSpec,
  UnsafeTriggerByNameSpec,
} from "./internal/trigger";
export { eventEmissionsResource, eventTriggersResource } from "./internal/resources";

export default {
  id: "events",
  name: "Events",
  description:
    "Event→job bindings layered on @plugins/jobs. Plugins declare events with typed filter columns via defineTriggerEvent, subscribers bind jobs via trigger().",
  loadBearing: true,
  httpRoutes: {
    "GET /api/events/emissions": handleListEmissions,
    "GET /api/events/triggers": handleListTriggers,
    "DELETE /api/events/triggers/:id": handleDeleteTrigger,
    "PATCH /api/events/triggers/:id": handlePatchTrigger,
  },
  register: [eventsDispatchJob, jobsHooksRegistration],
  contributions: [Resource.Declare(eventEmissionsResource), Resource.Declare(eventTriggersResource)],
} satisfies ServerPluginDefinition;
