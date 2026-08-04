import { useEventSources } from "@plugins/apps/plugins/events/plugins/events-core/web";
import type { EventSource } from "@plugins/apps/plugins/events/plugins/events-core/core";

/**
 * The result of looking one source up in the live sources window.
 *
 * A discriminated union rather than `EventSource | null`, because the three
 * non-answers mean genuinely different things to a caller and a `null` would
 * collapse them: "still loading", "the subscription is broken", and "this id is
 * not a source" each want different chrome. `missing` in particular is the one a
 * pane must render as an explicit dead end, not as an eternal spinner.
 */
export type SourceLookup =
  | { status: "pending" }
  | { status: "error"; error: Error }
  | { status: "found"; source: EventSource }
  | { status: "missing" };

/**
 * One source out of the live `events.sources` window. Every section of the
 * detail pane reads through this, so they all share one subscription.
 *
 * NOTE the window bound: `eventSourcesResource` is an ordered window (newest
 * first, default 100), so a source outside it reports `missing`. That is the
 * documented contract of the resource, not a bug here — `events-core` exposes no
 * point read for a single source that does not throw on 404.
 */
export function useEventSource(sourceId: string): SourceLookup {
  const result = useEventSources();
  if (result.pending) {
    return result.error
      ? { status: "error", error: result.error }
      : { status: "pending" };
  }
  const source = result.data.find((s) => s.id === sourceId);
  return source ? { status: "found", source } : { status: "missing" };
}
