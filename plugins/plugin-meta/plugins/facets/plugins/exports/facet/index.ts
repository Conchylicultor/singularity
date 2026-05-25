import { join } from "path";
import {
  createFacet,
  getFacet,
  type DocFact,
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

  renderDoc(data) {
    const facts: DocFact[] = [];
    for (const rt of RUNTIMES) {
      const symbols = data[rt];
      if (symbols.length === 0) continue;
      const types = symbols.filter((s) => s.kind === "type");
      const values = symbols.filter((s) => s.kind === "value");
      const parts: string[] = [];
      if (types.length > 0) parts.push(`Types: ${types.map((s) => `\`${s.name}\``).join(", ")}`);
      if (values.length > 0) parts.push(`Values: ${values.map((s) => `\`${s.name}\``).join(", ")}`);
      facts.push({ folder: rt, key: "Exports", values: [parts.join("; ")] });
    }
    return facts;
  },
});
