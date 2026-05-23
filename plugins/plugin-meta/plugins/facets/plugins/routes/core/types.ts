import { defineFacet } from "@plugins/plugin-meta/plugins/facets/core";

export interface RouteDef {
  route: string;
  type: "http" | "ws";
  runtime: "server" | "central";
  name?: string;
}

export const routesFacetDef = defineFacet<RouteDef[]>("routes");
