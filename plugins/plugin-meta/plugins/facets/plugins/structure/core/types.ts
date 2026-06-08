import { defineFacet } from "@plugins/plugin-meta/plugins/facets/core";

export interface StructureFacetData {
  folders: { name: string; standard: boolean }[];
  looseFiles: string[];
  compositionRoot: boolean;
}

export const structureFacetDef = defineFacet<StructureFacetData>("structure");
