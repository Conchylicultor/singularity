/**
 * Whether a node sits inside an editor's editable region — where the editor,
 * not this primitive, owns both the copy and the look of a selected chip.
 *
 * Matches `contenteditable="false"` too, and that is wanted: an inline chip in a
 * Lexical document is a `contenteditable=false` decorator inside an editable
 * root, and either way the editor owns it (Lexical copies the node's own
 * `getTextContent()`, and rings a selected decorator itself).
 *
 * One statement for both halves of the primitive, so the copy handler and the
 * selection ring can never disagree about which surfaces are theirs.
 */
export function isInsideEditable(node: Node): boolean {
  const element =
    node.nodeType === Node.ELEMENT_NODE
      ? (node as Element)
      : node.parentElement;
  return element?.closest("[contenteditable]") != null;
}
