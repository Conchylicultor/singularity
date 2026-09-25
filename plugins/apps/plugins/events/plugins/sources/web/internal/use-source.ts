import { useEventSourceRow } from "@plugins/apps/plugins/events/plugins/events-core/web";
import type { EventSource } from "@plugins/apps/plugins/events/plugins/events-core/core";

/**
 * The result of looking one source up by id.
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
 * One source, live, by id. Every section of the detail pane reads through this,
 * so they all share one subscription (the same `(key, params)` tuple).
 *
 * A point read on the `events.sources` collection's `:rows` sibling, not a
 * `.find` over a window: `missing` means the source does not exist — never that
 * it sits outside the newest-100 window, which is what the old window lookup
 * reported for an older source.
 */
export function useEventSource(sourceId: string): SourceLookup {
  const result = useEventSourceRow(sourceId);
  if (result.pending) {
    return result.error
      ? { status: "error", error: result.error }
      : { status: "pending" };
  }
  return result.found
    ? { status: "found", source: result.row }
    : { status: "missing" };
}
