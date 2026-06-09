import { defineFacet } from "@plugins/plugin-meta/plugins/facets/core";
import type { PluginId, RuntimeFolder } from "@plugins/framework/plugins/plugin-id/core";

export interface ExportedSymbol {
  name: string;
  kind: "type" | "value";
  consumers: PluginId[];
}

export type ExportsData = Record<RuntimeFolder, ExportedSymbol[]>;

export const exportsFacetDef = defineFacet<ExportsData>("exports");
