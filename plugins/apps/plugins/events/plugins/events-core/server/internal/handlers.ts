import { implement } from "@plugins/infra/plugins/endpoints/server";
import {
  createEventSource,
  deleteEventSource,
  getEventSource,
  getEventSourceRun,
  listEventSourceRuns,
  listEventSources,
  listRunEvents,
  refreshAllEventSources,
  refreshEventSourceNow,
  updateEventSource,
} from "../../core";
import {
  createSource,
  deleteSource,
  listRunEvents as selectRunEvents,
  listRuns,
  listSources,
  requireRun,
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

export const handleCreateSource = implement(
  createEventSource,
  async ({ body }) => createSource(body),
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

/**
 * "Refresh all" — every ENABLED source, tallied by the same arms one source
 * would have answered with.
 *
 * A disabled source is not a candidate at all, so it is skipped before the
 * engine is asked and counted nowhere; `skipped` only ever holds a refusal of a
 * request we actually made (the row was disabled between this listing and its
 * own enqueue).
 *
 * Sequential `for`/`await`, deliberately not `Promise.all`: an enqueue is cheap
 * and ordered, so there is nothing to win by fanning out, and a throw must
 * surface loudly as a failed request rather than being folded into a
 * settled-results array nobody inspects. A partial enqueue is harmless —
 * `refreshSourceJob` dedups per source, so the sources already enqueued simply
 * run, and pressing the button again picks up the rest.
 */
export const handleRefreshAll = implement(refreshAllEventSources, async () => {
  const tally = { enqueued: 0, alreadyRunning: 0, skipped: 0 };
  for (const source of await listSources()) {
    if (!source.enabled) continue;
    const result = await requestSourceRefresh(source.id);
    // Exhaustive on purpose: a new arm in `RefreshSourceResult` becomes a tsc
    // error right here instead of being silently uncounted, which is the one
    // way a tally can lie without anything looking broken.
    switch (result.status) {
      case "enqueued":
        tally.enqueued += 1;
        break;
      case "already-running":
        tally.alreadyRunning += 1;
        break;
      case "skipped":
        tally.skipped += 1;
        break;
      default: {
        const _exhaustive: never = result;
        throw new Error(`unhandled refresh result: ${String(_exhaustive)}`);
      }
    }
  }
  return tally;
});

export const handleListRuns = implement(
  listEventSourceRuns,
  async ({ params, query }) => {
    await requireSource(params.id);
    return listRuns(params.id, query.limit ?? 50);
  },
);

// Keyed by the run id alone — no source id to check it against, and none needed:
// the run row carries its own `sourceId`.
export const handleGetRun = implement(getEventSourceRun, async ({ params }) =>
  requireRun(params.runId),
);

// `requireRun` first, so an unknown run is a 404 rather than an empty list — the
// two mean completely different things here ("this run is gone" vs "this run
// touched nothing", which is what every `unchanged` run legitimately looks like).
export const handleListRunEvents = implement(
  listRunEvents,
  async ({ params, query }) => {
    await requireRun(params.runId);
    return selectRunEvents(params.runId, query.limit ?? 200);
  },
);
