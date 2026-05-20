export interface FacetDef<T> {
  id: string;
  _phantom?: T;
}

export function defineFacet<T>(id: string): FacetDef<T> {
  return { id };
}

export function getFacet<T>(node: { facets: Record<string, unknown> }, def: FacetDef<T>): T | undefined {
  return node.facets[def.id] as T | undefined;
}

export function setFacet<T>(node: { facets: Record<string, unknown> }, def: FacetDef<T>, data: T): void {
  node.facets[def.id] = data;
}
