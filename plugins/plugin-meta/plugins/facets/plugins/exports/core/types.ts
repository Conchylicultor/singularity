import { defineFacet } from "@plugins/plugin-meta/plugins/facets/core";

export interface ExportedSymbol {
  name: string;
  kind: "type" | "value";
  consumers: string[];
}

export interface ExportsData {
  core: ExportedSymbol[];
  web: ExportedSymbol[];
  server: ExportedSymbol[];
  central: ExportedSymbol[];
  shared: ExportedSymbol[];
}

export const exportsFacetDef = defineFacet<ExportsData>("exports");
