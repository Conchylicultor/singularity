import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { EventSources } from "./slots";
export {
  useEventSources,
  useEventsRevision,
  useEventSourceRuns,
  useEventSourceRun,
  useCreateEventSource,
  useUpdateEventSource,
  useDeleteEventSource,
  useRefreshEventSourceNow,
} from "./internal/hooks";
export { useSourceOriginUrl } from "./internal/source-origin";

export default {
  description:
    "Contract layer for the Events app, web half: the EventSources.Type source-type slot plus the live sources / events-revision hooks and the source-CRUD mutations.",
  contributions: [],
} satisfies PluginDefinition;
