import { $createTextNode, $isTextNode } from "lexical";
import type { LinkNode } from "@lexical/link";

/**
 * Replace a link's visible text with `text`, as ONE text node carrying the
 * marks and style of the link's first run. Must run inside an `editor.update`.
 *
 * The new text goes in BEFORE the old children come out, and that order is the
 * whole reason this helper exists. `LinkNode.canBeEmpty()` is false, so removing
 * a link's last child removes the link itself (`$removeNode`'s empty-parent
 * cleanup). The obvious `link.clear().append(next)` therefore deletes the link
 * on `clear()` and appends into a detached node: the edit commits, records an
 * undo entry, and leaves the block without its link — with nothing thrown.
 */
export function $setLinkText(link: LinkNode, text: string): void {
  const old = link.getChildren();
  const first = old[0];
  const next = $createTextNode(text);
  if ($isTextNode(first)) {
    next.setFormat(first.getFormat());
    next.setStyle(first.getStyle());
  }
  link.append(next);
  for (const child of old) child.remove();
}
