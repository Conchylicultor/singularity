import { useCallback } from "react";
import { useSourceOriginUrl } from "@plugins/apps/plugins/events/plugins/events-core/web";
import type { EventRecord } from "@plugins/apps/plugins/events/plugins/events-core/core";
import { externalUrl } from "./format";

/**
 * Where one event opens, in the order a person means it: the event's OWN page
 * when the extractor found one, else the page it was extracted from.
 *
 * The fallback is what makes activation worth wiring at all — an extraction that
 * yields a title and a date but no per-event link is the common case, and the
 * source page is still the answer to "show me this". It is resolved generically
 * through `useSourceOriginUrl`, so this surface names no source type.
 *
 * `null` = this event has no destination (a hand-entered event on a manual
 * source, typically). Kept as a separate resolver from the opener so the row's
 * link chip and the row click agree on the target by construction.
 */
export function useEventUrl(): (event: EventRecord) => string | null {
  const originUrl = useSourceOriginUrl();
  return useCallback(
    (event: EventRecord): string | null =>
      externalUrl(event.url) ?? externalUrl(originUrl(event.sourceId)),
    [originUrl],
  );
}

/**
 * Activate an event: open its page in a new tab. A no-op for an event with no
 * destination — there is nothing to fail at, and nothing to say.
 */
export function useOpenEvent(): (event: EventRecord) => void {
  const eventUrl = useEventUrl();
  return useCallback(
    (event: EventRecord): void => {
      const target = eventUrl(event);
      if (target === null) return;
      window.open(target, "_blank", "noopener,noreferrer");
    },
    [eventUrl],
  );
}
