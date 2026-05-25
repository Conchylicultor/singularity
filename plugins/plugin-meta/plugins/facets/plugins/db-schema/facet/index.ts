import { join } from "path";
import { existsSync, readdirSync } from "fs";
import { relative } from "path";
import {
  createFacet,
  getFacet,
  type DocFact,
} from "@plugins/plugin-meta/plugins/facets/core";
import type { PluginTree } from "@plugins/plugin-meta/plugins/plugin-tree/core";
import {
  readIfExists,
  stripTypes,
} from "@plugins/plugin-meta/plugins/parse-utils/core";
import { type DbSchemaFacetData, dbSchemaFacetDef } from "../core";

// ── Helpers ────────────────────────────────────────────────────────────

interface ImportBinding {
  local: string;
  original: string;
  module: string;
}

function parseImports(src: string): Map<string, ImportBinding> {
  const map = new Map<string, ImportBinding>();
  const namedRe = /import\s+(?:([A-Za-z_$][\w$]*)\s*,\s*)?\{([^}]+)\}\s*from\s*["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = namedRe.exec(src))) {
    const defLocal = m[1];
    const names = m[2]!;
    const mod = m[3]!;
    if (defLocal) map.set(defLocal, { local: defLocal, original: "default", module: mod });
    for (const raw of names.split(",")) {
      let s = raw.trim();
      if (!s) continue;
      s = s.replace(/^type\s+/, "");
      const asMatch = s.match(/^(\w+)\s+as\s+(\w+)$/);
      if (asMatch) map.set(asMatch[2]!, { local: asMatch[2]!, original: asMatch[1]!, module: mod });
      else if (/^\w+$/.test(s)) map.set(s, { local: s, original: s, module: mod });
    }
  }
  const defRe = /import\s+([A-Za-z_$][\w$]*)\s+from\s*["']([^"']+)["']/g;
  while ((m = defRe.exec(src))) map.set(m[1]!, { local: m[1]!, original: "default", module: m[2]! });
  return map;
}

interface RawExtRef {
  parentVarName: string;
  parentModule: string;
  extName: string;
}

function parseEntityExtensionCalls(dbFiles: string[]): RawExtRef[] {
  const out: RawExtRef[] = [];
  for (const f of dbFiles) {
    const raw = readIfExists(f);
    if (!raw || !raw.includes("defineExtension")) continue;
    const src = stripTypes(raw);
    const imports = parseImports(src);
    const re = /\bdefineExtension\s*\(\s*([A-Za-z_$][\w$]*)\s*,\s*"([^"]+)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      const imp = imports.get(m[1]!);
      if (!imp) continue;
      out.push({ parentVarName: imp.original, parentModule: imp.module, extName: m[2]! });
    }
  }
  return out;
}

function parseTableNamesFromDbFiles(dbFiles: string[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const f of dbFiles) {
    const raw = readIfExists(f);
    if (!raw) continue;
    const src = stripTypes(raw);
    const re = /(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*pgTable\s*\(\s*["']([^"']+)["']/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) out.set(m[1]!, m[2]!);
  }
  return out;
}

function findDbFiles(pluginDir: string): string[] {
  const serverDir = join(pluginDir, "server");
  if (!existsSync(serverDir)) return [];
  const results: string[] = [];
  function walk(d: string) {
    let entries;
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = join(d, e.name);
      if (e.isDirectory()) {
        walk(full);
      } else if (e.name.endsWith(".ts") && e.name !== "index.ts") {
        const byName = /schema|tables?/.test(e.name.replace(/\.ts$/, ""));
        const src = byName ? null : readIfExists(full);
        const byContent = !byName && !!src && (src.includes("pgTable(") || src.includes("pgView("));
        if (byName || byContent) results.push(full);
      }
    }
  }
  walk(serverDir);
  return results.sort();
}

// ── Facet ──────────────────────────────────────────────────────────────

const pluginModuleRe = /@plugins\/([^/"'`]+)\/(?:server|central|shared|core)/;

export default createFacet<DbSchemaFacetData>({
  def: dbSchemaFacetDef,

  extract(ctx) {
    const dbFiles = findDbFiles(ctx.dir);
    const tableMap = parseTableNamesFromDbFiles(dbFiles);
    const tables = [...tableMap.entries()].map(([varName, name]) => ({ name, varName }));
    return { dbFiles, tables, entityExtensions: [], extendedBy: [] };
  },

  relate(rawCtx) {
    const { tree } = rawCtx as { tree: PluginTree };
    const byName = new Map<string, { name: string; facets: Record<string, unknown> }>();
    for (const node of tree.byDir.values()) byName.set(node.name, node);

    // Build plugin-name → varName→tableName map from Phase 1 extract data
    const pluginVarToTable = new Map<string, Map<string, string>>();
    for (const node of tree.byDir.values()) {
      const d = getFacet(node, dbSchemaFacetDef);
      if (!d) continue;
      const m = new Map<string, string>();
      for (const t of d.tables) m.set(t.varName, t.name);
      pluginVarToTable.set(node.name, m);
    }

    for (const node of tree.byDir.values()) {
      const data = getFacet(node, dbSchemaFacetDef);
      if (!data) continue;
      for (const ref of parseEntityExtensionCalls(data.dbFiles)) {
        const pluginMatch = ref.parentModule.match(pluginModuleRe);
        if (!pluginMatch) continue;
        const parentPluginName = pluginMatch[1]!;
        const parentTableName =
          (pluginVarToTable.get(parentPluginName) ?? new Map()).get(ref.parentVarName) ?? "";
        const tableName = parentTableName
          ? `${parentTableName}_ext_${ref.extName}`
          : `${parentPluginName}_ext_${ref.extName}`;
        if (!data.entityExtensions.some((e) => e.tableName === tableName)) {
          data.entityExtensions.push({ parentPlugin: parentPluginName, extName: ref.extName, tableName });
        }
        const parentNode = byName.get(parentPluginName);
        if (!parentNode) continue;
        const parentData = getFacet(parentNode, dbSchemaFacetDef);
        if (parentData && !parentData.extendedBy.some((e) => e.tableName === tableName)) {
          parentData.extendedBy.push({ childPlugin: node.name, extName: ref.extName, tableName });
        }
      }
    }

    for (const node of tree.byDir.values()) {
      const d = getFacet(node, dbSchemaFacetDef);
      if (!d) continue;
      d.entityExtensions.sort((a, b) => a.tableName.localeCompare(b.tableName));
      d.extendedBy.sort((a, b) => a.tableName.localeCompare(b.tableName));
    }
  },

  renderDoc(data, ctx) {
    const facts: DocFact[] = [];
    if (data.dbFiles.length > 0) {
      facts.push({ folder: "server", key: "DB schema", values: data.dbFiles.map((f) => `\`${relative(ctx.root, f)}\``) });
    }
    if (data.entityExtensions.length > 0) {
      facts.push({ folder: "server", key: "Entity extension of", values: data.entityExtensions.map((ext) => `\`${ext.parentPlugin}\` (table \`${ext.tableName}\`)`) });
    }
    if (data.extendedBy.length > 0) {
      facts.push({ folder: "cross-plugin", key: "Extended by", values: data.extendedBy.map((e) => `\`${e.childPlugin}\` (table \`${e.tableName}\`)`) });
    }
    return facts;
  },
});
