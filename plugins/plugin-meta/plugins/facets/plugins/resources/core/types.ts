import { defineFacet } from "@plugins/plugin-meta/plugins/facets/core";

export interface ResourceDef {
  key: string;
  mode: string;
}

export interface ResourceFacetData {
  server: ResourceDef[];
  central: ResourceDef[];
}

export const resourcesFacetDef = defineFacet<ResourceFacetData>("resources");
