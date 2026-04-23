import type { ServerPluginDefinition } from "../../../server/src/types";
import { startWorker } from "./internal/worker";

export { defineAction } from "./internal/action";
export type { ActionFactory, ActionRef, DefineActionSpec } from "./internal/action";
export { defineTriggerEvent } from "./internal/event";
export type {
  DefineTriggerEventSpec,
  EventHandle,
  EventSource,
  FilterSlot,
} from "./internal/event";
export { deleteTrigger, trigger } from "./internal/trigger";
export type { TriggerSpec } from "./internal/trigger";

export default {
  id: "events",
  name: "Events",
  description:
    "Infrastructure for typed events, actions, and persisted triggers.",
  onReady: async () => {
    await startWorker();
  },
} satisfies ServerPluginDefinition;
