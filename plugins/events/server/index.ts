import type { ServerPluginDefinition } from "@server/types";
// Side-effect import: registers the `events.dispatch` job at module load so
// it's in `jobRegistry` before any `emit()` call happens post-boot.
import "./internal/dispatch-job";

export { defineTriggerEvent } from "./internal/event";
export type {
  DefineTriggerEventSpec,
  EventHandle,
  EventSource,
  FilterSlot,
} from "./internal/event";
export { deleteTrigger, deleteTriggersFor, trigger } from "./internal/trigger";
export type { TriggerSpec } from "./internal/trigger";

export default {
  id: "events",
  name: "Events",
  description:
    "Event→job bindings layered on @plugins/jobs. Plugins declare events with typed filter columns via defineTriggerEvent, subscribers bind jobs via trigger().",
} satisfies ServerPluginDefinition;
