import type { Block } from "@plugins/page/plugins/editor/core";

/**
 * Root-first chain of ancestor pages for `pageId`, walking `parentId` up from
 * the page's immediate parent to the root. Excludes the page itself. Returns
 * [] for a root page or an unknown id. Guards against cycles in the parent
 * chain (defensive — the tree should be acyclic).
 */
export function pageAncestors(pages: Block[], pageId: string): Block[] {
  const byId = new Map(pages.map((p) => [p.id, p]));
  const ancestors: Block[] = [];
  const seen = new Set<string>([pageId]);
  let cur = byId.get(pageId)?.parentId ?? null;
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const node = byId.get(cur);
    if (!node) break;
    ancestors.unshift(node);
    cur = node.parentId;
  }
  return ancestors;
}
