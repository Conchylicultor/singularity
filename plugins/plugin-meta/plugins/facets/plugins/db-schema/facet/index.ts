import { join } from "path";
import { existsSync, readdirSync } from "fs";
import { relative } from "path";
import {
  createFacet,
  getFacet,
  type DocFact,
} from "@plugins/plugin-meta/plugins/facets/core";
import {
  type PluginTree,
  type PluginNode,
  resolvePluginSpecifier,
} from "@plugins/plugin-meta/plugins/plugin-tree/core";
import { asPath, type PluginId } from "@plugins/framework/plugins/plugin-id/core";
import {
  readIfExists,
  stripTypes,
  findMarkerCalls,
  maskSource,
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

// `defineExtension(ParentVar, "name")` — the first positional arg is the parent
// table variable, the second a string literal name.
const EXTENSION_ARGS_RE = /^\s*([A-Za-z_$][\w$]*)\s*,\s*"([^"]+)"/;

function parseEntityExtensionCalls(dbFiles: string[]): RawExtRef[] {
  const out: RawExtRef[] = [];
  for (const f of dbFiles) {
    const raw = readIfExists(f);
    if (!raw || !raw.includes("defineExtension")) continue;
    const src = stripTypes(raw);
    const imports = parseImports(src);
    for (const call of findMarkerCalls(src, "defineExtension")) {
      const args = EXTENSION_ARGS_RE.exec(call.argsText);
      if (!args) continue;
      const imp = imports.get(args[1]!);
      if (!imp) continue;
      out.push({ parentVarName: imp.original, parentModule: imp.module, extName: args[2]! });
    }
  }
  return out;
}

// Recovers `varName → physical table name` for one schema source file. Two
// declaration forms produce a physical table, and consumers import the bound
// variable to extend it:
//
//   1. Raw drizzle:   `const _foo = pgTable("foo", …)`            → `_foo → foo`
//   2. defineEntity:  `const fooEntity = defineEntity("foo", …)`  (infra/entities)
//                     `export const _foo = fooEntity.table`        → `_foo → foo`
//
// For form (2) the `pgTable(...)` call is hidden inside `defineEntity`, so the
// physical table surfaces as `<entity>.table`. We map the `.table` alias (the
// name consumers actually import) to the entity's table name, and drop the
// intermediate entity binding so a table is never reported twice.
export function parseTableNames(src: string, out: Map<string, string>): void {
  // Form (1): direct pgTable bindings.
  const pgRe = /(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*pgTable\s*\(\s*["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = pgRe.exec(src))) out.set(m[1]!, m[2]!);

  // Form (2a): `const <entity> = defineEntity("name", …)` bindings.
  const entityVarToName = new Map<string, string>();
  const entityRe = /(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*defineEntity\s*\(\s*["']([^"']+)["']/g;
  while ((m = entityRe.exec(src))) entityVarToName.set(m[1]!, m[2]!);

  // Form (2b): `const <alias> = <entity>.table` re-exports — the alias is the
  // importable handle; the entity var is intermediate.
  const aliasSources = new Set<string>();
  const aliasRe = /(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*([A-Za-z_$][\w$]*)\.table\b/g;
  while ((m = aliasRe.exec(src))) {
    const name = entityVarToName.get(m[2]!);
    if (name === undefined) continue;
    out.set(m[1]!, name);
    aliasSources.add(m[2]!);
  }

  // Inline `const <alias> = defineEntity("name", …).table` (no separate
  // statement): the binding var is itself the usable handle. Keep every entity
  // var not already consumed as a `.table` alias source.
  for (const [v, name] of entityVarToName) {
    if (!aliasSources.has(v)) out.set(v, name);
  }
}

function parseTableNamesFromDbFiles(dbFiles: string[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const f of dbFiles) {
    const raw = readIfExists(f);
    if (!raw) continue;
    parseTableNames(stripTypes(raw), out);
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
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code == null) throw err;
      return;
    }
    for (const e of entries) {
      const full = join(d, e.name);
      if (e.isDirectory()) {
        walk(full);
      } else if (e.name.endsWith(".ts") && e.name !== "index.ts") {
        const byName = /schema|tables?/.test(e.name.replace(/\.ts$/, ""));
        // Mask comments + string interiors so a commented or stringified
        // `pgTable(` / `pgView(` doesn't misclassify a non-schema file.
        const raw = byName ? null : readIfExists(full);
        const src = raw === null ? null : maskSource(raw, { strings: true });
        const byContent = !byName && !!src && (src.includes("pgTable(") || src.includes("pgView("));
        if (byName || byContent) results.push(full);
      }
    }
  }
  walk(serverDir);
  return results.sort();
}

// ── Facet ──────────────────────────────────────────────────────────────

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
    const byId = new Map<PluginId, PluginNode>();
    for (const node of tree.byDir.values()) byId.set(node.id, node);

    // Build node.id → varName→tableName map from Phase 1 extract data
    const pluginVarToTable = new Map<PluginId, Map<string, string>>();
    for (const node of tree.byDir.values()) {
      const d = getFacet(node, dbSchemaFacetDef);
      if (!d) continue;
      const m = new Map<string, string>();
      for (const t of d.tables) m.set(t.varName, t.name);
      pluginVarToTable.set(node.id, m);
    }

    for (const node of tree.byDir.values()) {
      const data = getFacet(node, dbSchemaFacetDef);
      if (!data) continue;
      for (const ref of parseEntityExtensionCalls(data.dbFiles)) {
        // A defineExtension parent is always a cross-plugin barrel import.
        if (!ref.parentModule.startsWith("@plugins/")) continue;
        const r = resolvePluginSpecifier(tree, ref.parentModule);
        // Same rationale as the cross-refs facet: an unresolved parent is a
        // genuine bug already caught by tsc + the boundary checker at build
        // time, or a transient artifact of building this tree at runtime over a
        // live, mid-mutation working dir (e.g. the `main` checkout half-written
        // during a `./singularity push` merge). Skip rather than crash the tree
        // build for an unrelated baseline tree.
        if (!r) continue;
        const parentPlugin = r.node.id;
        const parentTableName =
          (pluginVarToTable.get(parentPlugin) ?? new Map()).get(ref.parentVarName) ?? "";
        const tableName = parentTableName
          ? `${parentTableName}_ext_${ref.extName}`
          : `${r.node.name}_ext_${ref.extName}`;
        if (!data.entityExtensions.some((e) => e.tableName === tableName)) {
          data.entityExtensions.push({ parentPlugin, extName: ref.extName, tableName });
        }
        const parentNode = byId.get(parentPlugin);
        if (!parentNode) continue;
        const parentData = getFacet(parentNode, dbSchemaFacetDef);
        if (parentData && !parentData.extendedBy.some((e) => e.tableName === tableName)) {
          parentData.extendedBy.push({ childPlugin: node.id, extName: ref.extName, tableName });
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
      facts.push({ folder: "server", key: "Entity extension of", values: data.entityExtensions.map((ext) => `\`${asPath(ext.parentPlugin)}\` (table \`${ext.tableName}\`)`) });
    }
    if (data.extendedBy.length > 0) {
      facts.push({ folder: "cross-plugin", key: "Extended by", values: data.extendedBy.map((e) => `\`${asPath(e.childPlugin)}\` (table \`${e.tableName}\`)`) });
    }
    return facts;
  },
});
