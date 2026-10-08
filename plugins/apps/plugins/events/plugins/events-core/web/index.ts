import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { EventSources } from "./slots";
import { IdKinds } from "@plugins/ids/web";
import { eventSourceIdKind, eventIdKind } from "../core";

export { EventSources } from "./slots";
export {
  useEventSources,
  useEventSourceRow,
  useEventSourceRun,
  useRunEvents,
  useCreateEventSource,
  useUpdateEventSource,
  useDeleteEventSource,
  useRefreshEventSourceNow,
  useRefreshAllEventSources,
} from "./internal/hooks";
export { useEventSourceOrigin } from "./internal/source-origin";

export default {
  description:
    "Contract layer for the Events app, web half: the EventSources.Type source-type slot plus the live sources / run hooks and the source-CRUD mutations.",
  contributions: [
    IdKinds.Kind({ kind: eventSourceIdKind }),
    IdKinds.Kind({ kind: eventIdKind }),
  ],
  slots: EventSources,
} satisfies PluginDefinition;
