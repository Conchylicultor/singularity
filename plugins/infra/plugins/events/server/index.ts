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
import {
  syncTriggerContributions,
  sweepStaleTriggers,
} from "./internal/trigger-contributions";
import {
  listEmissions,
  listTriggers,
  deleteTriggerEndpoint,
  patchTriggerEndpoint,
} from "../core/endpoints";

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
export { Trigger } from "./internal/trigger-contributions";
export { eventEmissionsResource, eventTriggersResource } from "./internal/resources";

export default {
  id: "events",
  name: "Events",
  description:
    "Event→job bindings layered on @plugins/jobs. Plugins declare events with typed filter columns via defineTriggerEvent, subscribers bind jobs via trigger().",
  loadBearing: true,
  httpRoutes: {
    [listEmissions.route]: handleListEmissions,
    [listTriggers.route]: handleListTriggers,
    [deleteTriggerEndpoint.route]: handleDeleteTrigger,
    [patchTriggerEndpoint.route]: handlePatchTrigger,
  },
  register: [eventsDispatchJob, jobsHooksRegistration],
  contributions: [Resource.Declare(eventEmissionsResource), Resource.Declare(eventTriggersResource)],
  onReady: async () => {
    await syncTriggerContributions();
    await sweepStaleTriggers();
  },
} satisfies ServerPluginDefinition;
