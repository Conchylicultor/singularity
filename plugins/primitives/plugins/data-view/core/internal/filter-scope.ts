/**
 * What a hierarchical view's filter is evaluated on — `ViewState.filterScope`.
 *
 * - **`rows`** (default) — every row is tested; a row survives when it matches
 *   or has a matching descendant (matches plus the ancestor chain of each
 *   match), so a filtered row keeps its hierarchical context.
 * - **`roots`** — only the ROOTS are tested; a root that matches keeps its whole
 *   subtree, whatever its descendants hold, and no ancestor is ever pulled in
 *   (a root has none). The partition a `groupBy` on the roots makes, as a
 *   filter: several view instances over the same tree, each owning the roots
 *   one filter selects, never split a subtree between them.
 *
 * Tree-only: a flat view has no hierarchy, so it ignores the key and every row
 * is tested alone.
 */
export type FilterScope = "rows" | "roots";

/** How {@link scopeFilterRows} reads a row's place in the hierarchy. */
export interface FilterScopeAccessors<T> {
  key: (item: T) => string;
  /** The parent's key, or `null` for a top-level row. */
  parentOf: (item: T) => string | null;
  matches: (item: T) => boolean;
}

/**
 * The rows of a hierarchy that survive a filter under `scope`, in their
 * incoming order. The ONE statement of both scopes, so the tree view that
 * renders the rows and the host that asks "is this view empty?" before
 * mounting it cannot disagree.
 *
 * Roots follow the tree's orphan rule: a row whose parent is `null` or absent
 * from `items` is a root (a filter or search upstream can drop a parent). A
 * parent cycle (corrupt data) terminates at the first repeat and treats the
 * entry point as its own root. Returns `items` itself when every row survives,
 * so a memo downstream keeps its identity.
 */
export function scopeFilterRows<T>(
  items: readonly T[],
  scope: FilterScope,
  { key, parentOf, matches }: FilterScopeAccessors<T>,
): readonly T[] {
  const parentByKey = new Map<string, string | null>();
  for (const item of items) parentByKey.set(key(item), parentOf(item));
  const kept =
    scope === "roots"
      ? keptByRoot(items, key, parentByKey, matches)
      : keptWithAncestors(items, key, parentByKey, matches);
  return kept.size === items.length
    ? items
    : items.filter((item) => kept.has(key(item)));
}

/** `rows`: every match, plus the ancestor chain of each. */
function keptWithAncestors<T>(
  items: readonly T[],
  key: (item: T) => string,
  parentByKey: ReadonlyMap<string, string | null>,
  matches: (item: T) => boolean,
): Set<string> {
  const keep = new Set<string>();
  for (const item of items) if (matches(item)) keep.add(key(item));
  for (const id of [...keep]) {
    let cur = parentByKey.get(id) ?? null;
    while (cur !== null && parentByKey.has(cur) && !keep.has(cur)) {
      keep.add(cur);
      cur = parentByKey.get(cur) ?? null;
    }
  }
  return keep;
}

/** `roots`: every row whose root matches. */
function keptByRoot<T>(
  items: readonly T[],
  key: (item: T) => string,
  parentByKey: ReadonlyMap<string, string | null>,
  matches: (item: T) => boolean,
): Set<string> {
  // Memoized root climb — each key resolved once, so the pass stays O(n).
  const rootOf = new Map<string, string>();
  const resolveRoot = (id: string): string => {
    const path: string[] = [];
    const onPath = new Set<string>();
    let cur = id;
    let root: string;
    for (;;) {
      const cached = rootOf.get(cur);
      if (cached !== undefined) {
        root = cached;
        break;
      }
      const parent = parentByKey.get(cur) ?? null;
      if (parent === null || !parentByKey.has(parent) || onPath.has(parent)) {
        root = cur;
        break;
      }
      path.push(cur);
      onPath.add(cur);
      cur = parent;
    }
    rootOf.set(cur, root);
    for (const p of path) rootOf.set(p, root);
    return root;
  };

  const keptRoots = new Set<string>();
  for (const item of items) {
    const id = key(item);
    if (resolveRoot(id) === id && matches(item)) keptRoots.add(id);
  }
  const keep = new Set<string>();
  for (const item of items) {
    const id = key(item);
    if (keptRoots.has(resolveRoot(id))) keep.add(id);
  }
  return keep;
}
