export function filterTree<T>(
  nodes: T[],
  predicate: (node: T) => boolean,
  getChildren: (node: T) => T[],
  rebuild: (node: T, children: T[]) => T,
): T[] {
  return nodes
    .map((node) => filterNode(node, predicate, getChildren, rebuild))
    .filter((n): n is T => n !== null);
}

function filterNode<T>(
  node: T,
  predicate: (node: T) => boolean,
  getChildren: (node: T) => T[],
  rebuild: (node: T, children: T[]) => T,
): T | null {
  const matches = predicate(node);
  const filteredChildren = getChildren(node)
    .map((c) => filterNode(c, predicate, getChildren, rebuild))
    .filter((c): c is T => c !== null);
  if (!matches && filteredChildren.length === 0) return null;
  return rebuild(node, filteredChildren);
}

export function collectAllIds<T>(
  nodes: T[],
  getId: (node: T) => string,
  getChildren: (node: T) => T[],
): string[] {
  const out: string[] = [];
  function visit(n: T) {
    out.push(getId(n));
    for (const c of getChildren(n)) visit(c);
  }
  for (const n of nodes) visit(n);
  return out;
}
