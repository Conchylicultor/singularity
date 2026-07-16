import type { Block } from "@plugins/page/plugins/editor/core";

/**
 * Root-first chain of ancestor pages for `pageId`, walking `pageId` (the
 * denormalized nearest PAGE ancestor) up from the page's parent page to the
 * root. Excludes the page itself. Returns [] for a root page or an unknown id.
 *
 * Deliberately NOT `parentId`: that is the raw block-forest pointer, and a
 * sub-page's direct parent may be a content block (nested under a text line, a
 * toggle, …) — walking it over the pages-only list would truncate the chain at
 * the first non-page parent. `pageId` is the page-level relation, invariant
 * under intra-page block moves.
 *
 * Guards against cycles in the chain (defensive — the hierarchy is acyclic).
 */
export function pageAncestors(pages: Block[], pageId: string): Block[] {
  const byId = new Map(pages.map((p) => [p.id, p]));
  const ancestors: Block[] = [];
  const seen = new Set<string>([pageId]);
  let cur = byId.get(pageId)?.pageId ?? null;
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const node = byId.get(cur);
    if (!node) break;
    ancestors.unshift(node);
    cur = node.pageId;
  }
  return ancestors;
}
