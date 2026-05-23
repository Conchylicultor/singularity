export interface FacetDef<T> {
  id: string;
  _phantom?: T;
}

export interface ExtractContext {
  dir: string;
  // Barrel-imported modules for this plugin (populated by buildPluginTree when skipBarrelImport is not set).
  // Undefined for facets that only need static file access.
  importedModules?: { mod: Record<string, unknown>; runtime: "web" | "server" | "central" }[];
}

export interface RenderDocContext {
  bodyIndent: string;
}

export interface Facet {
  def: FacetDef<unknown>;
  extract: (ctx: ExtractContext) => unknown;
  relate?: (ctx: unknown) => void;
  renderDoc: (data: unknown, ctx: RenderDocContext) => string[];
}

export function defineFacet<T>(id: string): FacetDef<T> {
  return { id };
}

export function createFacet<T>(impl: {
  def: FacetDef<T>;
  extract: (ctx: ExtractContext) => T;
  relate?: (ctx: unknown) => void;
  renderDoc: (data: T, ctx: RenderDocContext) => string[];
}): Facet {
  return impl as Facet;
}

export function getFacet<T>(node: { facets: Record<string, unknown> }, def: FacetDef<T>): T | undefined {
  return node.facets[def.id] as T | undefined;
}

export function setFacet<T>(node: { facets: Record<string, unknown> }, def: FacetDef<T>, data: T): void {
  node.facets[def.id] = data;
}
