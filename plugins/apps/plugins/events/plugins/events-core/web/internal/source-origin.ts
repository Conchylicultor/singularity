import { useMemo } from "react";
import { externalUrl, type SourceRef } from "../../core";
import { EventSources } from "../slots";

/**
 * Resolve one source — a whole row, or the `SourceRef` an event row carries — to
 * the web page it stands for ("what is this source?", "where did this event come
 * from?"), or `null` when it stands for none.
 *
 * The registry is the whole of it: a ref carries its own `type` and `config`, so
 * this needs nothing but the `EventSources.Type` contribution that knows how to
 * read a `config` of that type. A surface holding the ref therefore asks nothing
 * of the live sources window — an events list gets the ref joined onto each
 * event row by the server, so no source id is ever looked up here — and a new source type ships its `originUrl` and is
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
export function useEventSourceOrigin(): (source: SourceRef) => string | null {
  const types = EventSources.Type.useContributions();

  return useMemo(() => {
    const byType = new Map(types.map((t) => [t.id, t]));
    return (source: SourceRef): string | null =>
      externalUrl(byType.get(source.type)?.originUrl?.(source.config) ?? null);
  }, [types]);
}
