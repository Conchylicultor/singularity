import { pageData, pageKindOf } from "@plugins/page/plugins/editor/core";
import type { FrameCandidate } from "@plugins/page/plugins/editor/web";

/**
 * Whether a sub-page row is drawn as a CARD: a page of a special kind (an
 * agent-authored page, an instructions page) expanded inline. Its whole content
 * is that kind's — the agent's words, the human's standing instructions — so the
 * wash its reference row wears must cover that content too, or the expanded
 * lines read as the parent page's own prose.
 *
 * Collapsed, the row is a plain reference and keeps its own tint; an ordinary
 * page is never a card, so expanding one moves nothing.
 *
 * ONE predicate, read by both halves that must agree: the frame's `applies`
 * (whether the editor groups the subtree into a box) and the row (which drops
 * its own fill while the box paints it, or the title line would be washed
 * twice). The kinds are the closed `PageKind` set `page/editor` owns; how each
 * one LOOKS stays with its own `PageReference.Decoration`.
 */
export function isPageCard(block: FrameCandidate): boolean {
  return block.expanded && pageKindOf(pageData(block)).kind !== "page";
}
