import { useMemo } from "react";
import { externalUrl, type EventSource } from "../../core";
import { EventSources } from "../slots";
import { useEventSources } from "./hooks";

/**
 * Resolve one source ROW to the web page it stands for — "what is this source?"
 * — or `null` when it stands for none.
 *
 * The registry is the whole of it: a row carries its own `type` and `config`, so
 * this needs nothing but the `EventSources.Type` contribution that knows how to
 * read a `config` of that type. A surface holding the row therefore asks nothing
 * of the live sources window, and a new source type ships its `originUrl` and is
 * picked up here with zero edits.
 *
 * A resolver function rather than a per-row hook, so a list can resolve every
 * rendered row through ONE registry read.
 *
 * The answer passes `externalUrl` HERE, at the mint, not at each call site: a
 * type reads its URL out of a config field the user typed freely, so the string
 * is untrusted, and gating it once means no consumer has to remember to. What
 * comes back is therefore always safe to hand to the DOM as a destination.
 *
 * `null` covers every "there is no page" arm — the type is uninstalled, the type
 * stands for no page, the stored blob no longer fits the type's fields, or what
 * it holds is not an ordinary web address. That is a lookup miss, not a
 * swallowed failure: each of those states is *reported where it is actionable*
 * (the Sources surface says an unregistered type out loud, and the Settings
 * section says an invalid blob), and the only thing a caller can do with it here
 * is not offer a link.
 */
export function useEventSourceOrigin(): (source: EventSource) => string | null {
  const types = EventSources.Type.useContributions();

  return useMemo(() => {
    const byType = new Map(types.map((t) => [t.id, t]));
    return (source: EventSource): string | null =>
      externalUrl(byType.get(source.type)?.originUrl?.(source.config) ?? null);
  }, [types]);
}

/**
 * The same answer for a surface that holds only a source ID — "where did this
 * event come from?".
 *
 * The id→row join lives here because `events-core` is the one plugin holding BOTH
 * halves: the live `event_sources` rows and the type registry. A consumer
 * therefore gets the answer without importing the sources plugin or naming a
 * source type.
 *
 * A resolver function rather than a per-id hook: the events list asks for one row
 * out of a rendered window at click time, so a hook per row would mean a
 * subscription per row for a value only one of them ever needs.
 *
 * `null` adds one arm to {@link useEventSourceOrigin}'s: the source is not in the
 * live window (yet, or at all).
 */
export function useSourceOriginUrl(): (sourceId: string) => string | null {
  const sources = useEventSources();
  const originOf = useEventSourceOrigin();

  return useMemo(() => {
    const rows = sources.pending ? [] : sources.data;
    const byId = new Map(rows.map((s) => [s.id, s]));
    return (sourceId: string): string | null => {
      const source = byId.get(sourceId);
      return source === undefined ? null : originOf(source);
    };
  }, [sources, originOf]);
}
