import { serveValue } from "@plugins/network/plugins/live/server";
import { metricRevision } from "../../core";
import { getMetricRegistry } from "./registry";

// `metricRevision({ sourceId })`, served external: the truth is whatever the
// source's own `changes` watches (a change feed, a git ref, a refresh job).
//
// `rev` = `<bootId>:<n>`. The boot id keeps a restarted backend from handing
// out a rev a browser already holds for older numbers. `n` also moves at the
// START of every subscription span: nothing watches a source while no one is
// subscribed, so a change in that gap is invisible — a fresh rev per span makes
// the browser refetch rather than trust a cached result from before the gap.

const bootId = crypto.randomUUID();
const counters = new Map<string, number>();

function bump(sourceId: string): void {
  counters.set(sourceId, (counters.get(sourceId) ?? 0) + 1);
}

export const metricRevisionServed = serveValue(metricRevision, {
  source: "external",
  loader: ({ sourceId }) => {
    // Loud on an id no source contributed, rather than a rev for nothing.
    getMetricRegistry().source(sourceId);
    return { rev: `${bootId}:${counters.get(sourceId) ?? 0}` };
  },
  // A burst of changes (a bulk write, a fetch landing many commits) is one refetch.
  throttleMs: 1000,
  whileSubscribed: ({ sourceId }, notify) => {
    const source = getMetricRegistry().source(sourceId);
    bump(sourceId);
    if (source.changes === undefined) return () => {};
    return source.changes(() => {
      bump(sourceId);
      notify();
    });
  },
});
