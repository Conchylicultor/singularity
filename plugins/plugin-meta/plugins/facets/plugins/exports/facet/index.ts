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
  RUNTIME_FOLDERS,
  type RuntimeFolder,
  type PluginId,
} from "@plugins/framework/plugins/plugin-id/core";
import {
  parseBarrelExports,
  readIfExists,
  maskSource,
} from "@plugins/plugin-meta/plugins/parse-utils/core";
import { crossRefsFacetDef } from "@plugins/plugin-meta/plugins/facets/plugins/cross-refs/core";
import { type ExportedSymbol, type ExportsData, exportsFacetDef } from "../core";

export default createFacet<ExportsData>({
  def: exportsFacetDef,

  extract(ctx) {
    const parse = (runtime: RuntimeFolder): ExportedSymbol[] => {
      const raw = readIfExists(join(ctx.dir, runtime, "index.ts"));
      if (!raw) return [];
      // Fully mask comments/regex/strings (parseBarrelExports reads only
      // export-name identifiers, never a string value) so neither a commented-out
      // `export const X` nor an `export … from "…"` written inside a string can
      // register a phantom symbol.
      const src = maskSource(raw);
      return parseBarrelExports(src).map(({ name, kind }) => ({
        name,
        kind,
        consumers: [] as PluginId[],
      }));
    };
    const out = {} as ExportsData;
    for (const rt of RUNTIME_FOLDERS) out[rt] = parse(rt);
    return out;
  },

  relate(ctx: unknown) {
    const { tree } = ctx as { tree: PluginTree };
    const byId = new Map<PluginId, PluginNode>();
    for (const node of tree.byDir.values()) byId.set(node.id, node);

    for (const importer of tree.byDir.values()) {
      const xrefs = getFacet(importer, crossRefsFacetDef);
      if (!xrefs) continue;
      for (const rt of RUNTIME_FOLDERS) {
        for (const use of xrefs.apiUses[rt]) {
          if (!use.symbol) continue;
          const target = byId.get(use.plugin);
          if (!target || target === importer) continue;
          const targetData = getFacet(target, exportsFacetDef);
          if (!targetData) continue;
          for (const rt2 of RUNTIME_FOLDERS) {
            const sym = targetData[rt2].find((s) => s.name === use.symbol);
            if (sym && !sym.consumers.includes(importer.id)) {
              sym.consumers.push(importer.id);
            }
          }
        }
      }
    }
    for (const node of tree.byDir.values()) {
      const data = getFacet(node, exportsFacetDef);
      if (!data) continue;
      for (const rt of RUNTIME_FOLDERS) {
        for (const sym of data[rt]) sym.consumers.sort();
      }
    }
  },

  renderDoc(data) {
    const facts: DocFact[] = [];
    for (const rt of RUNTIME_FOLDERS) {
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
