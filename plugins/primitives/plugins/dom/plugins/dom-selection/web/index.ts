import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export {
  hasBox,
  selectionIsCollapsed,
  selectionRange,
  selectionRect,
} from "./internal/dom-selection";

export default {
  description:
    "The one sanctioned home for the guarded document-selection read: selectionRange() states the three-part guard (no selection → rangeCount 0 → getRangeAt(0) throwing IndexSizeError) that four hand-rolled copies each remembered a different subset of, selectionRect() is that range's bounding rect, hasBox(rect) is the one statement of 'a rect with no box is not an anchor', and selectionIsCollapsed() answers 'does the user have anything highlighted right now' — the question Lexical's model gets wrong for a whole task after a one-step selection gesture. Named for the DOM selection to keep it apart from Lexical's model $getSelection; owns the range read too, since a copy handler wants the range for its content, not its geometry.",
  contributions: [],
} satisfies PluginDefinition;
