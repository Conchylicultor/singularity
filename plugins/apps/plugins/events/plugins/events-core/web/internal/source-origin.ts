import { useMemo } from "react";
import { EventSources } from "../slots";
import { useEventSources } from "./hooks";

/**
 * Resolve a source id to the web page that source stands for — "where did this
 * event come from?" — or `null` when it stands for none.
 *
 * The join lives here because `events-core` is the one plugin holding BOTH halves:
 * the live `event_sources` rows (their `type` + `config`) and the `EventSources.Type`
 * registry that knows how to read a `config` of that type. A consumer therefore
 * gets the answer without importing the sources plugin or naming a source type —
 * a new type ships its `originUrl` and every consumer picks it up.
 *
 * A resolver function rather than a per-id hook: the events list asks for one row
 * out of a rendered window at click time, so a hook per row would mean a
 * subscription per row for a value only one of them ever needs.
 *
 * `null` covers every "there is no page" arm — source not in the live window yet,
 * its type uninstalled, the type stands for no page, or its stored blob no longer
 * fits the type's fields. That is a lookup miss, not a swallowed failure: each of
 * those states is *reported where it is actionable* (the Sources surface says an
 * unregistered type out loud, and the Settings section says an invalid blob), and
 * the only thing a caller can do with it here is not offer a link.
 */
export function useSourceOriginUrl(): (sourceId: string) => string | null {
  const sources = useEventSources();
  const types = EventSources.Type.useContributions();

  return useMemo(() => {
    const rows = sources.pending ? [] : sources.data;
    const byId = new Map(rows.map((s) => [s.id, s]));
    const byType = new Map(types.map((t) => [t.id, t]));
    return (sourceId: string): string | null => {
      const source = byId.get(sourceId);
      if (source === undefined) return null;
      return byType.get(source.type)?.originUrl?.(source.config) ?? null;
    };
  }, [sources, types]);
}
