import { useEffect, useState } from "react";
import { selectionRange } from "@plugins/primitives/plugins/dom/plugins/dom-selection/web";

/** A finished text selection inside the transcript, and what to anchor a surface to. */
export interface TranscriptSelection {
  text: string;
  /**
   * The live range's box, read on every reposition, in the transcript's
   * scroller (`contextElement`) so the surface follows that scroller's scroll.
   */
  anchor: { getBoundingClientRect: () => DOMRect; contextElement: Element };
}

/**
 * The part of `range` that lies inside `scope`, or null when none does. A
 * triple-click on the transcript's last paragraph ends the range at the start of
 * the next text in the page — past the scroller, in an overlay strip or the
 * prompt box — so its end is cut back to the scroller's rather than refused.
 */
export function rangeWithin(range: Range, scope: HTMLElement): Range | null {
  if (!range.intersectsNode(scope)) return null;
  const clipped = range.cloneRange();
  const inner = document.createRange();
  inner.selectNodeContents(scope);
  if (clipped.compareBoundaryPoints(Range.START_TO_START, inner) < 0) {
    clipped.setStart(scope, 0);
  }
  if (clipped.compareBoundaryPoints(Range.END_TO_END, inner) > 0) {
    clipped.setEnd(scope, scope.childNodes.length);
  }
  return clipped.collapsed ? null : clipped;
}

/**
 * The keys of the transcript rows the range selects text in. Not the rows its
 * two ends sit in: a triple-click (or a drag past the end of a paragraph) ends
 * the range at offset 0 of the NEXT row, which holds none of the selection.
 */
function rowKeysWithSelectedText(range: Range, scope: HTMLElement): string[] {
  const keys: string[] = [];
  for (const row of scope.querySelectorAll("[data-event-key]")) {
    if (!range.intersectsNode(row)) continue;
    const part = document.createRange();
    part.selectNodeContents(row);
    if (part.compareBoundaryPoints(Range.START_TO_START, range) < 0) {
      part.setStart(range.startContainer, range.startOffset);
    }
    if (part.compareBoundaryPoints(Range.END_TO_END, range) > 0) {
      part.setEnd(range.endContainer, range.endOffset);
    }
    if (part.toString().trim()) keys.push(row.getAttribute("data-event-key")!);
  }
  return keys;
}

/**
 * The document selection's part inside `root`, when every row it selects
 * text in is one `accepts` takes — else null. Settles on release: while a pointer is
 * down the selection is still being made, so nothing is reported until it
 * comes up (a keyboard selection reports as it changes). Scrolling the
 * transcript hides it until the scroll ends, when it is read again where the
 * selection now sits.
 */
export function useTranscriptSelection(
  root: HTMLElement | null,
  accepts: (rowKey: string) => boolean,
): TranscriptSelection | null {
  const [selection, setSelection] = useState<TranscriptSelection | null>(null);

  useEffect(() => {
    if (!root) return;
    const scope = root;
    let pointerDown = false;

    function read() {
      const selected = selectionRange();
      if (!selected || selected.collapsed) return setSelection(null);
      const range = rangeWithin(selected, scope);
      if (!range) return setSelection(null);
      const rows = rowKeysWithSelectedText(range, scope);
      if (rows.length === 0 || !rows.every(accepts)) return setSelection(null);
      const text = range.toString().trim();
      if (!text) return setSelection(null);
      setSelection({
        text,
        anchor: {
          getBoundingClientRect: () => range.getBoundingClientRect(),
          contextElement: scope,
        },
      });
    }
    function onSelectionChange() {
      if (!pointerDown) read();
    }
    function onPointerDown() {
      pointerDown = true;
    }
    function onPointerUp() {
      pointerDown = false;
      read();
    }
    function onScroll() {
      setSelection(null);
    }

    document.addEventListener("selectionchange", onSelectionChange);
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("pointerup", onPointerUp, true);
    scope.addEventListener("scroll", onScroll, { passive: true });
    scope.addEventListener("scrollend", read);
    return () => {
      document.removeEventListener("selectionchange", onSelectionChange);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("pointerup", onPointerUp, true);
      scope.removeEventListener("scroll", onScroll);
      scope.removeEventListener("scrollend", read);
    };
  }, [root, accepts]);

  return selection;
}
