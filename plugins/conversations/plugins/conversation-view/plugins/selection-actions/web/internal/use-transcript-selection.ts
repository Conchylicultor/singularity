import { useEffect, useState } from "react";
import { selectionRange } from "@plugins/primitives/plugins/dom/plugins/dom-selection/web";

/** A finished text selection inside the transcript, and what to anchor a surface to. */
export interface TranscriptSelection {
  text: string;
  /** The live range's box, read on every reposition so the surface follows a scroll. */
  anchor: { getBoundingClientRect: () => DOMRect };
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
 * The document selection, when it lies inside `root` and every row it selects
 * text in is one `accepts` takes — else null. Settles on release: while a pointer is
 * down the selection is still being made, so nothing is reported until it
 * comes up (a keyboard selection reports as it changes).
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
      const range = selectionRange();
      if (!range || range.collapsed) return setSelection(null);
      if (
        !scope.contains(range.startContainer) ||
        !scope.contains(range.endContainer)
      ) {
        return setSelection(null);
      }
      const rows = rowKeysWithSelectedText(range, scope);
      if (rows.length === 0 || !rows.every(accepts)) return setSelection(null);
      const text = range.toString().trim();
      if (!text) return setSelection(null);
      setSelection({
        text,
        anchor: { getBoundingClientRect: () => range.getBoundingClientRect() },
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

    document.addEventListener("selectionchange", onSelectionChange);
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("pointerup", onPointerUp, true);
    return () => {
      document.removeEventListener("selectionchange", onSelectionChange);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("pointerup", onPointerUp, true);
    };
  }, [root, accepts]);

  return selection;
}
