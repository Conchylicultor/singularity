import {
  createFacet,
  type DocFact,
} from "@plugins/plugin-meta/plugins/facets/core";
import { type ResourceFacetData, resourcesFacetDef } from "../core";
import { parseResources } from "./parse-resources";

export default createFacet<ResourceFacetData>({
  def: resourcesFacetDef,

  extract(ctx) {
    return parseResources(ctx.dir);
  },

  renderDoc(data) {
    const facts: DocFact[] = [];
    if (data.server.length > 0) {
      facts.push({ folder: "server", key: "Resources", values: data.server.map((r) => `\`${r.key}\` (${r.mode})`) });
    }
    if (data.central.length > 0) {
      facts.push({ folder: "central", key: "Resources", values: data.central.map((r) => `\`${r.key}\` (${r.mode})`) });
    }
    return facts;
  },
});
