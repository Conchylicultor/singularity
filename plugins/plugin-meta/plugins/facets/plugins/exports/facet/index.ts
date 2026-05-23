import { join } from "path";
import {
  createFacet,
  getFacet,
} from "@plugins/plugin-meta/plugins/facets/core";
import type {
  PluginNode,
  PluginTree,
} from "@plugins/plugin-meta/plugins/plugin-tree/core";
import {
  parseBarrelExports,
  readIfExists,
} from "@plugins/plugin-meta/plugins/parse-utils/core";
import { crossRefsFacetDef } from "@plugins/plugin-meta/plugins/facets/plugins/cross-refs/core";
import { type ExportedSymbol, type ExportsData, exportsFacetDef } from "../core";

const RUNTIMES = ["core", "web", "server", "central", "shared"] as const;
type Runtime = (typeof RUNTIMES)[number];

export default createFacet<ExportsData>({
  def: exportsFacetDef,

  extract(ctx) {
    const parse = (runtime: Runtime): ExportedSymbol[] => {
      const src = readIfExists(join(ctx.dir, runtime, "index.ts"));
      if (!src) return [];
      return parseBarrelExports(src).map(({ name, kind }) => ({ name, kind, consumers: [] }));
    };
    return {
      core: parse("core"),
      web: parse("web"),
      server: parse("server"),
      central: parse("central"),
      shared: parse("shared"),
    };
  },

  relate(ctx: unknown) {
    const { tree } = ctx as { tree: PluginTree };
    const byName = new Map<string, PluginNode>();
    for (const node of tree.byDir.values()) byName.set(node.name, node);

    for (const importer of tree.byDir.values()) {
      const xrefs = getFacet(importer, crossRefsFacetDef);
      if (!xrefs) continue;
      const allUses = [
        ...(xrefs.apiUses["server"] ?? []),
        ...(xrefs.apiUses["central"] ?? []),
        ...(xrefs.apiUses["web"] ?? []),
        ...(xrefs.apiUses["core"] ?? []),
        ...(xrefs.apiUses["shared"] ?? []),
      ];
      for (const use of allUses) {
        const dot = use.indexOf(".");
        if (dot < 0) continue;
        const targetName = use.slice(0, dot);
        const symbol = use.slice(dot + 1);
        const target = byName.get(targetName);
        if (!target || target === importer) continue;
        const targetData = getFacet(target, exportsFacetDef);
        if (!targetData) continue;
        for (const rt of RUNTIMES) {
          const sym = targetData[rt].find((s) => s.name === symbol);
          if (sym && !sym.consumers.includes(importer.name)) {
            sym.consumers.push(importer.name);
          }
        }
      }
    }
    for (const node of tree.byDir.values()) {
      const data = getFacet(node, exportsFacetDef);
      if (!data) continue;
      for (const rt of RUNTIMES) {
        for (const sym of data[rt]) sym.consumers.sort();
      }
    }
  },

  renderDoc(data, ctx) {
    const lines: string[] = [];
    const subIndent = `${ctx.bodyIndent}  `;
    const renderRuntime = (rt: Runtime, symbols: ExportedSymbol[]) => {
      if (symbols.length === 0) return;
      const types = symbols.filter((s) => s.kind === "type");
      const values = symbols.filter((s) => s.kind === "value");
      lines.push(`${ctx.bodyIndent}- Exports (${rt}):`);
      if (types.length > 0) {
        lines.push(`${subIndent}- Types: ${types.map((s) => `\`${s.name}\``).join(", ")}`);
      }
      if (values.length > 0) {
        lines.push(`${subIndent}- Values: ${values.map((s) => `\`${s.name}\``).join(", ")}`);
      }
    };
    renderRuntime("core", data.core);
    renderRuntime("web", data.web);
    renderRuntime("server", data.server);
    renderRuntime("central", data.central);
    renderRuntime("shared", data.shared);
    return lines;
  },
});
