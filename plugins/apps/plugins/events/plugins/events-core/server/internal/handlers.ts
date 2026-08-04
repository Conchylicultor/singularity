import { implement } from "@plugins/infra/plugins/endpoints/server";
import {
  createEventSource,
  deleteEventSource,
  getEventSource,
  listEventSourceRuns,
  listEventSources,
  refreshEventSourceNow,
  updateEventSource,
} from "../../core";
import {
  createSource,
  deleteSource,
  listRuns,
  listSources,
  requireSource,
  updateSource,
} from "./sources-repo";
import { requestSourceRefresh } from "./refresh-runner";

export const handleListSources = implement(listEventSources, async () =>
  listSources(),
);

export const handleGetSource = implement(getEventSource, async ({ params }) =>
  requireSource(params.id),
);

export const handleCreateSource = implement(createEventSource, async ({ body }) =>
  createSource(body),
);

export const handleUpdateSource = implement(
  updateEventSource,
  async ({ params, body }) => updateSource(params.id, body),
);

export const handleDeleteSource = implement(
  deleteEventSource,
  async ({ params }) => {
    await deleteSource(params.id);
  },
);

// 404s on an unknown id BEFORE reaching the engine, so "Refresh now" on a
// deleted source is an error rather than a silently-dropped enqueue.
export const handleRefreshSource = implement(
  refreshEventSourceNow,
  async ({ params }) => {
    await requireSource(params.id);
    return requestSourceRefresh(params.id);
  },
);

export const handleListRuns = implement(
  listEventSourceRuns,
  async ({ params, query }) => {
    await requireSource(params.id);
    return listRuns(params.id, query.limit ?? 50);
  },
);
