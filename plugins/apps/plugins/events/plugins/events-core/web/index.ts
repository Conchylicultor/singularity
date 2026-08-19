import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { EventSources } from "./slots";

export { EventSources } from "./slots";
export {
  useEventSources,
  useEventsRevision,
  useEventSourceRuns,
  useEventSourceRun,
  useRunEvents,
  useCreateEventSource,
  useUpdateEventSource,
  useDeleteEventSource,
  useRefreshEventSourceNow,
  useRefreshAllEventSources,
} from "./internal/hooks";
export { useSourceOriginUrl } from "./internal/source-origin";

export default {
  description:
    "Contract layer for the Events app, web half: the EventSources.Type source-type slot plus the live sources / events-revision hooks and the source-CRUD mutations.",
  contributions: [],
  slots: EventSources,
} satisfies PluginDefinition;
