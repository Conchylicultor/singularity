import { useEffect } from "react";
import { useEventCallback } from "@plugins/primitives/plugins/latest-ref/web";
import { useResizeObserver } from "@plugins/primitives/plugins/dom/plugins/element-size/web";

/**
 * How tall a loaded prototype document is, for the canvas's Whole page mode —
 * reported through `onHeight` as it changes, so the canvas (which fits every
 * frame to the tallest page) holds the numbers and nothing is mirrored into
 * state by an effect.
 *
 * **Measured at the declared viewport height, never at the frame's current
 * one.** The frame is briefly set back to `viewportH` (an inline height, which
 * wins over its `height` attribute), the document's `scrollHeight` is read,
 * and the inline height is dropped again — all in one task, so nothing paints
 * in between. Measuring at the frame's own height instead would never
 * converge on a page that sizes something in `vh`: growing the frame grows
 * that element, which grows the document, which grows the frame again.
 *
 * Re-measured whenever the document's `<html>` or `<body>` changes size, and
 * whenever its DOM changes (a click that opens a section may leave `<body>`
 * stretched to the frame and so not resize it — a page that got SHORTER is
 * only caught this way). Both are coalesced to one measure per frame.
 *
 * Reports nothing until a document is ready, nor while `enabled` is false —
 * the caller then lays the frame out at `viewportH`.
 */
export function usePageHeight(
  ready: { frame: HTMLIFrameElement; doc: Document } | null,
  viewportH: number,
  enabled: boolean,
  onHeight: (height: number) => void,
): void {
  const live = enabled ? ready : null;
  const report = useEventCallback(onHeight);

  const measure = () => {
    if (!live || live.frame.contentDocument !== live.doc) return;
    report(measurePageHeight(live.frame, live.doc, viewportH));
  };

  useResizeObserver(
    () => (live ? [live.doc.documentElement, live.doc.body] : []),
    measure,
    { deps: [live, viewportH] },
  );

  useEffect(() => {
    if (!live) return;
    let rafId: number | null = null;
    const observer = new MutationObserver(() => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        measure();
      });
    });
    observer.observe(live.doc.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
    return () => {
      observer.disconnect();
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
    // `measure` closes over `live` and `viewportH`, the only inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, viewportH]);
}

/** The document's full height with its frame laid out `viewportH` tall. */
function measurePageHeight(
  frame: HTMLIFrameElement,
  doc: Document,
  viewportH: number,
): number {
  frame.style.height = `${viewportH}px`;
  const full = doc.documentElement.scrollHeight;
  frame.style.height = "";
  return Math.max(full, viewportH);
}
