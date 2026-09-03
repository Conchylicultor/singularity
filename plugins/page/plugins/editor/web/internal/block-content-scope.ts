import { defineDomScope } from "@plugins/primitives/plugins/scope/plugins/dom-scope/web";

/**
 * ONE editor's block-content grid — the box its `[data-block-id]` rows live in.
 *
 * Two page panes side by side are two `<BlockEditor>`s, and so are two tabs on
 * the same page (every open tab stays mounted, the unfocused ones `display:none`).
 * A document-wide `[data-block-id]` scan therefore answers with whichever pane is
 * first in DOM order — that was the drag-select bug, where the right pane's
 * marquee painted and selected nothing because the range it built named the left
 * pane's blocks. Rows belong to an editor, so every question about them is asked
 * of an editor's box.
 *
 * The editor itself owns the node and could use a plain ref. The scope exists for
 * the readers that CANNOT: the outline rail is a `PageDetail.Overlay`, rendered
 * beside the pane's scroller so it does not scroll away, which puts it outside
 * the editor's subtree — it can neither ref the grid nor walk up to it.
 */
export const blockContentScope = defineDomScope<HTMLDivElement>({
  name: "page.block-content",
  what: "the block list's own content grid (published by <BlockEditor>)",
  bounds: ["data-block-id"],
});

/**
 * Every rendered row of ONE editor, in document order.
 *
 * Takes the root rather than finding it: there is no such thing as "the" rows of
 * the document. The required parameter is what closes the class — there is no way
 * to call this without having named an editor first.
 */
export function blockRowsIn(root: HTMLElement): readonly HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>("[data-block-id]")];
}

/**
 * One rendered row of ONE editor, or `null` when it is not on screen — a heading
 * inside a collapsed toggle is in the document but has no DOM row.
 *
 * That `null` is not an absorbable failure: it is a per-id probe over a root the
 * caller has already established, so it means "this row is not rendered" and
 * nothing else.
 */
export function blockRowIn(root: HTMLElement, id: string): HTMLElement | null {
  return root.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(id)}"]`);
}
