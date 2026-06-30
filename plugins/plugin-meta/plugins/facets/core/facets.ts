import type { FsSnapshot } from "@plugins/plugin-meta/plugins/parse-utils/core";

export interface FacetDef<T> {
  id: string;
  _phantom?: T;
}

export interface ExtractContext {
  dir: string;
  // Barrel-imported modules for this plugin (populated by buildPluginTree when skipBarrelImport is not set).
  // Undefined for facets that only need static file access.
  importedModules?: { mod: Record<string, unknown>; runtime: "web" | "server" | "central" }[];
  // Build-scoped, read-once in-memory FS snapshot in effect for this extraction.
  // When present, the parse-utils `readIfExists` / `walkFiles` helpers read from
  // it instead of disk (wired ambiently by buildPluginTree's extract loop), so
  // facet bodies need no change. Absent for build-time callers that scan disk
  // directly. Facets read files via the parse-utils helpers, not this field.
  fs?: FsSnapshot;
}

export interface DocFact {
  folder: string;
  key: string;
  values: string[];
}

export interface RenderDocContext {
  root: string;
}

export interface Facet {
  def: FacetDef<unknown>;
  extract: (ctx: ExtractContext) => unknown;
  relate?: (ctx: unknown) => void;
  renderDoc: (data: unknown, ctx: RenderDocContext) => DocFact[];
}

export function defineFacet<T>(id: string): FacetDef<T> {
  return { id };
}

export function createFacet<T>(impl: {
  def: FacetDef<T>;
  extract: (ctx: ExtractContext) => T;
  relate?: (ctx: unknown) => void;
  renderDoc: (data: T, ctx: RenderDocContext) => DocFact[];
}): Facet {
  return impl as Facet;
}

export function getFacet<T>(node: { facets: Record<string, unknown> }, def: FacetDef<T>): T | undefined {
  return node.facets[def.id] as T | undefined;
}

export function setFacet<T>(node: { facets: Record<string, unknown> }, def: FacetDef<T>, data: T): void {
  node.facets[def.id] = data;
}
