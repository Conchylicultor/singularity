import { useEffect, useRef, useState, type RefObject } from "react";
import { useLatestRef } from "@plugins/primitives/plugins/latest-ref/web";

/**
 * The scroll container is a sibling of this strip inside the pane frame, not a
 * global. Walk up from our own node to the nearest ancestor whose subtree holds
 * a `[data-pane-scroll]`, so a second open conversation pane can't be targeted.
 */
function paneScrollFrom(from: Element): HTMLElement | null {
  let cur: Element | null = from.parentElement;
  while (cur) {
    const scroll = cur.querySelector<HTMLElement>("[data-pane-scroll]");
    if (scroll) return scroll;
    cur = cur.parentElement;
  }
  return null;
}

/**
 * The index of the LAST transcript row the reader can currently see — the line
 * everything above has been scrolled past, and therefore the point the strip's
 * stats are reported "as of". Null until the first observation lands.
 *
 * Push-based by construction: rows report themselves through an
 * IntersectionObserver as they enter and leave the pane, so there is no scroll
 * handler on the main thread and nothing polls a position.
 *
 * The observer is built ONCE and rows are enrolled incrementally as the
 * transcript grows — never rebuilt. Rebuilding it per new event (disconnect +
 * re-observe every row) would make each arriving line cost a full re-measure of
 * the whole transcript and a callback carrying one entry per row, which is
 * exactly the wrong shape for a pane that streams.
 *
 * The index is into the FILTERED transcript (`data-event-index`, the DOM's own
 * numbering); resolving it back to a raw event is the caller's job.
 */
export function useReadingAnchor(
  hostRef: RefObject<HTMLElement | null>,
  rowCount: number,
): number | null {
  const [anchor, setAnchor] = useState<number | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const enrolledRef = useRef<WeakSet<Element>>(new WeakSet());
  // Read inside the observer callback, which outlives the render that set it.
  const rowCountRef = useLatestRef(rowCount);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const scroller = paneScrollFrom(host);
    if (!scroller) return;

    const onScreen = new Set<number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const raw = (entry.target as HTMLElement).dataset.eventIndex;
          if (raw === undefined) continue;
          const index = Number(raw);
          if (!Number.isInteger(index)) continue;
          if (entry.isIntersecting) onScreen.add(index);
          else onScreen.delete(index);
        }
        // A row torn out of the transcript never reports leaving the screen, so
        // its index can outlive it here. Ignoring anything past the end keeps a
        // dropped tail row from pinning the anchor beyond the last real row.
        const limit = rowCountRef.current - 1;
        let last: number | null = null;
        for (const index of onScreen) {
          if (index > limit) continue;
          if (last === null || index > last) last = index;
        }
        // Nothing on screen is a transient (a scroller between rows, a pane
        // being torn down), not a reader who has read nothing — hold the last
        // known line rather than snapping the strip back to the full totals.
        setAnchor((prev) => last ?? prev);
      },
      { root: scroller },
    );
    observerRef.current = observer;
    return () => {
      observer.disconnect();
      observerRef.current = null;
      enrolledRef.current = new WeakSet();
    };
  }, [hostRef]);

  // Enrol rows as they appear. `observe` on an already-observed target is a
  // no-op per spec, but the WeakSet keeps this to the genuinely new ones and
  // lets a removed row be collected.
  useEffect(() => {
    const observer = observerRef.current;
    const host = hostRef.current;
    if (!observer || !host) return;
    const scroller = paneScrollFrom(host);
    if (!scroller) return;
    const enrolled = enrolledRef.current;
    for (const row of scroller.querySelectorAll("[data-event-index]")) {
      if (enrolled.has(row)) continue;
      enrolled.add(row);
      observer.observe(row);
    }
  }, [hostRef, rowCount]);

  return anchor;
}
