import { existsSync } from "fs";
import { join } from "path";
import {
  createFacet,
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

  renderDoc(data, ctx) {
    const lines: string[] = [];
    const indent = `${ctx.bodyIndent}  `;
    if (data.server.length > 0) {
      lines.push(
        `${indent}- Resources (server): ${data.server.map((r) => `\`${r.key}\` (${r.mode})`).join(", ")}`,
      );
    }
    if (data.central.length > 0) {
      lines.push(
        `${indent}- Resources (central): ${data.central.map((r) => `\`${r.key}\` (${r.mode})`).join(", ")}`,
      );
    }
    return lines;
  },
});
