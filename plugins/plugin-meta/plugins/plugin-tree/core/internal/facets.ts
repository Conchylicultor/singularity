export interface FacetDef<T> {
  id: string;
  _phantom?: T;
}

export interface Facet {
  def: FacetDef<unknown>;
  extract: (ctx: unknown) => unknown;
  relate?: (ctx: unknown) => void;
  renderDoc: (data: unknown, ctx: unknown) => string[];
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
