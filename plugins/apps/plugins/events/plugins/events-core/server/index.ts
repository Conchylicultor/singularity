import {
  Resource,
  type ServerPluginDefinition,
} from "@plugins/framework/plugins/server-core/core";
import {
  createEventSource,
  deleteEventSource,
  getEventSource,
  getEventSourceRun,
  listEventSourceRuns,
  listEventSources,
  refreshEventSourceNow,
  updateEventSource,
} from "../core";
import {
  handleCreateSource,
  handleDeleteSource,
  handleGetRun,
  handleGetSource,
  handleListRuns,
  handleListSources,
  handleRefreshSource,
  handleUpdateSource,
} from "./internal/handlers";
import {
  eventSourcesServerResource,
  eventsRevisionServerResource,
  eventRunsRevisionServerResource,
} from "./internal/resources";

// The physical tables, the source-type registry, the repo functions, and the
// refresh seam — everything the `refresh` engine, `event-list`, and `sources`
// build on. Re-exporting this plugin's OWN internal files is allowed; only
// proxying another plugin's symbols would violate the boundary rules.
export { _eventSources, _eventSourceRuns } from "./internal/tables";
// `events` is exported as a READ handle only. Every write goes through the repo
// funnel below, which owns the `updated_at` stamp the live revision tick reads;
// the `events/no-raw-events-write` lint rule fails any db.insert/update/delete
// on this handle outside `events-repo.ts`.
export { _events as eventsTable } from "./internal/tables";
export { upsertEvents, markEventsDisappeared } from "./internal/events-repo";
export type {
  EventWriteInput,
  UpsertEventsResult,
} from "./internal/events-repo";
export {
  defineEventSourceType,
  getEventSourceType,
  listEventSourceTypes,
} from "./internal/registry";
export type {
  EventSourceType,
  ProbeContext,
  ProbeResult,
} from "./internal/registry";
export {
  listSources,
  requireSource,
  createSource,
  updateSource,
  deleteSource,
  listRuns,
  requireRun,
} from "./internal/sources-repo";
export { registerRefreshRunner } from "./internal/refresh-runner";
export type { RefreshRunner } from "./internal/refresh-runner";
export {
  eventSourcesServerResource,
  eventsRevisionServerResource,
  eventRunsRevisionServerResource,
} from "./internal/resources";

export default {
  description:
    "Contract layer for the Events app: the event_sources / events / event_source_runs entities, the defineEventSourceType two-phase registry, source CRUD endpoints, and the live sources window + events revision tick.",
  httpRoutes: {
    [listEventSources.route]: handleListSources,
    [createEventSource.route]: handleCreateSource,
    [getEventSource.route]: handleGetSource,
    [updateEventSource.route]: handleUpdateSource,
    [deleteEventSource.route]: handleDeleteSource,
    [refreshEventSourceNow.route]: handleRefreshSource,
    [listEventSourceRuns.route]: handleListRuns,
    [getEventSourceRun.route]: handleGetRun,
  },
  contributions: [
    Resource.Declare(eventSourcesServerResource),
    Resource.Declare(eventsRevisionServerResource),
    Resource.Declare(eventRunsRevisionServerResource),
  ],
} satisfies ServerPluginDefinition;
