import { existsSync } from "fs";
import { join } from "path";
import {
  createFacet,
  type DocFact,
} from "@plugins/plugin-meta/plugins/facets/core";
import { type ResourceFacetData, resourcesFacetDef, parseResources } from "../core";

export default createFacet<ResourceFacetData>({
  def: resourcesFacetDef,

  extract(ctx) {
    const serverDir = join(ctx.dir, "server");
    const centralDir = join(ctx.dir, "central");
    return {
      server: existsSync(serverDir) ? parseResources(serverDir) : [],
      central: existsSync(centralDir) ? parseResources(centralDir) : [],
    };
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
