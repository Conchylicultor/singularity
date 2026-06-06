import { existsSync, readdirSync } from "fs";
import { basename, join, relative } from "path";
import {
  registerBarrelStubs,
  importBarrel,
} from "@plugins/plugin-meta/plugins/barrel-import/core";
import { loadFacets, setFacet, type Facet } from "@plugins/plugin-meta/plugins/facets/core";
export {
  readIfExists,
  stripTypes,
  matchBracket,
  parseBarrelExports,
  walkFiles,
  parseDefineGroup,
  parseStringField,
  parseBoolField,
  type BarrelExport,
} from "@plugins/plugin-meta/plugins/parse-utils/core";
import {
  readIfExists,
  stripTypes,
  parseStringField,
  parseBoolField,
  type BarrelExport,
} from "@plugins/plugin-meta/plugins/parse-utils/core";

// ── Re-exports from facet cores (backward compat) ──────────────────
export type { SlotDef } from "@plugins/plugin-meta/plugins/facets/plugins/slots/core";
export type { CommandDef } from "@plugins/plugin-meta/plugins/facets/plugins/commands/core";
export type { RouteDef, RoutesData } from "@plugins/plugin-meta/plugins/facets/plugins/routes/core";
export type { ResourceDef } from "@plugins/plugin-meta/plugins/facets/plugins/resources/core";
export type { EntityExtension, EntityExtensionRef, TableDef } from "@plugins/plugin-meta/plugins/facets/plugins/db-schema/core";
export type { Contribution, ContributionsFacetData, DocMetaContribution } from "@plugins/plugin-meta/plugins/facets/plugins/contributions/core";
export type { DocMetaRegistration } from "@plugins/plugin-meta/plugins/facets/plugins/registrations/core";

// ── Imports from facet cores (used locally by PluginNode & populateCompatFields) ──
import type { SlotDef } from "@plugins/plugin-meta/plugins/facets/plugins/slots/core";
import type { CommandDef } from "@plugins/plugin-meta/plugins/facets/plugins/commands/core";
import type { RoutesData } from "@plugins/plugin-meta/plugins/facets/plugins/routes/core";
import type { ResourceDef } from "@plugins/plugin-meta/plugins/facets/plugins/resources/core";
import type { EntityExtension, EntityExtensionRef, TableDef } from "@plugins/plugin-meta/plugins/facets/plugins/db-schema/core";
import type { Contribution, ContributionsFacetData, DocMetaContribution } from "@plugins/plugin-meta/plugins/facets/plugins/contributions/core";
import type { DocMetaRegistration } from "@plugins/plugin-meta/plugins/facets/plugins/registrations/core";

// ── Public types ────────────────────────────────────────────────────

export type Runtime = "web" | "server" | "central";

export interface RuntimeDetail {
  httpRoutes: string[];
  wsRoutes: string[];
  resources: ResourceDef[];
  apiUses: string[];
}

export interface PluginNode {
  dir: string;
  path: string;
  name: string;
  hierarchyId: string;
  description?: string;
  descriptions: Partial<Record<Runtime, string>>;
  loadBearing: boolean;
  collapsed: boolean;
  runtimes: Record<Runtime, boolean>;
  children: PluginNode[];
  facets: Record<string, unknown>;

  exports: Record<Runtime | "core" | "shared", BarrelExport[]>;
  slots: SlotDef[];
  commands: CommandDef[];
  contributions: Contribution[];
  server: RuntimeDetail;
  central: RuntimeDetail;
  webApiUses: string[];
  coreApiUses: string[];
  sharedApiUses: string[];
  dbFiles: string[];
  tables: TableDef[];

  importedBy: string[];
  slotContributors: string[];
  endpointCallers: string[];
  entityExtensions: EntityExtension[];
  extendedBy: EntityExtensionRef[];

  runtimeContributions?: DocMetaContribution[];
  runtimeRegistrations?: DocMetaRegistration[];
}

export interface PluginTree {
  pluginsRoot: string;
  byDir: Map<string, PluginNode>;
  roots: PluginNode[];
  facets: Facet[];
}

// ── Walk ────────────────────────────────────────────────────────────

function findAllPluginDirs(pluginsRoot: string): string[] {
  const out: string[] = [];
  function walk(dir: string, depth: number) {
    if (depth > 10) return;
    const hasWeb = existsSync(join(dir, "web", "index.ts"));
    const hasServer = existsSync(join(dir, "server", "index.ts"));
    const hasCentral = existsSync(join(dir, "central", "index.ts"));
    const hasShared = existsSync(join(dir, "shared", "index.ts"));
    const hasCore = existsSync(join(dir, "core", "index.ts"));
    const hasCheck = existsSync(join(dir, "check", "index.ts"));
    const hasLint = existsSync(join(dir, "lint", "index.ts"));
    const hasFacet = existsSync(join(dir, "facet", "index.ts"));
    const hasBarrel = hasWeb || hasServer || hasCentral || hasShared || hasCore || hasCheck || hasLint || hasFacet;
    const isUmbrella =
      !hasBarrel &&
      existsSync(join(dir, "plugins")) &&
      readdirSync(join(dir, "plugins"), { withFileTypes: true }).some((e) => e.isDirectory());
    if ((hasBarrel || isUmbrella) && dir !== pluginsRoot) out.push(dir);

    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (dir === pluginsRoot) walk(join(dir, e.name), depth + 1);
      else if (e.name === "plugins") {
        const sub = join(dir, e.name);
        const childEntries = readdirSync(sub, { withFileTypes: true });
        for (const c of childEntries) {
          if (c.isDirectory()) walk(join(sub, c.name), depth + 1);
        }
      }
    }
  }
  walk(pluginsRoot, 0);
  return out;
}

// ── Per-plugin collection ───────────────────────────────────────────

interface CollectedPlugin {
  node: PluginNode;
  parentDir: string | null;
}

function collectCoreFields(dir: string, pluginsRoot: string): CollectedPlugin {
  const webIndex = readIfExists(join(dir, "web", "index.ts"));
  const serverIndex = readIfExists(join(dir, "server", "index.ts"));
  const centralIndex = readIfExists(join(dir, "central", "index.ts"));

  const webSrc = webIndex ? stripTypes(webIndex) : null;
  const serverSrc = serverIndex ? stripTypes(serverIndex) : null;
  const centralSrc = centralIndex ? stripTypes(centralIndex) : null;

  const webDesc = webSrc ? parseStringField(webSrc, "description") : undefined;
  const serverDesc = serverSrc ? parseStringField(serverSrc, "description") : undefined;
  const centralDesc = centralSrc ? parseStringField(centralSrc, "description") : undefined;
  const descriptions: Partial<Record<Runtime, string>> = {};
  if (webDesc) descriptions.web = webDesc;
  if (serverDesc) descriptions.server = serverDesc;
  if (centralDesc) descriptions.central = centralDesc;
  let description = webDesc ?? serverDesc ?? centralDesc;
  if (!description) {
    const pkgSrc = readIfExists(join(dir, "package.json"));
    if (pkgSrc) {
      try {
        const pkg = JSON.parse(pkgSrc);
        if (typeof pkg.description === "string" && pkg.description) description = pkg.description;
      // eslint-disable-next-line promise-safety/no-bare-catch
      } catch {}
    }
  }

  const loadBearing =
    (webSrc ? parseBoolField(webSrc, "loadBearing") : false) ||
    (serverSrc ? parseBoolField(serverSrc, "loadBearing") : false) ||
    (centralSrc ? parseBoolField(centralSrc, "loadBearing") : false);

  let collapsed =
    (webSrc ? parseBoolField(webSrc, "collapsed") : false) ||
    (serverSrc ? parseBoolField(serverSrc, "collapsed") : false) ||
    (centralSrc ? parseBoolField(centralSrc, "collapsed") : false);
  if (!collapsed) {
    const pkgSrc = readIfExists(join(dir, "package.json"));
    if (pkgSrc) {
      try {
        const pkg = JSON.parse(pkgSrc);
        if (pkg.singularity?.collapsed === true) collapsed = true;
      // eslint-disable-next-line promise-safety/no-bare-catch
      } catch {}
    }
  }

  const rel = relative(pluginsRoot, dir);
  const segs = rel.split(/[\\/]+/);
  let parentDir: string | null = null;
  if (segs.length >= 3 && segs[segs.length - 2] === "plugins") {
    parentDir = join(pluginsRoot, ...segs.slice(0, segs.length - 2));
  }

  const path = rel.split("\\").join("/");

  return {
    parentDir,
    node: {
      dir,
      path,
      name: basename(dir),
      hierarchyId: "",
      description,
      descriptions,
      loadBearing,
      collapsed,
      runtimes: {
        web: !!webIndex,
        server: !!serverIndex,
        central: !!centralIndex,
      },
      children: [],
      facets: {},
      exports: { web: [], server: [], central: [], core: [], shared: [] },
      slots: [],
      commands: [],
      contributions: [],
      server: { httpRoutes: [], wsRoutes: [], resources: [], apiUses: [] },
      central: { httpRoutes: [], wsRoutes: [], resources: [], apiUses: [] },
      webApiUses: [],
      coreApiUses: [],
      sharedApiUses: [],
      dbFiles: [],
      tables: [],
      importedBy: [],
      slotContributors: [],
      endpointCallers: [],
      entityExtensions: [],
      extendedBy: [],
    },
  };
}

// ── Tree assembly ───────────────────────────────────────────────────

function computeHierarchyIds(nodes: PluginNode[], parentId: string): void {
  for (const node of nodes) {
    node.hierarchyId = parentId ? `${parentId}.${node.name}` : node.name;
    computeHierarchyIds(node.children, node.hierarchyId);
  }
}

export async function buildPluginTree(
  pluginsRoot: string,
  opts?: { skipBarrelImport?: boolean },
): Promise<PluginTree> {
  // Step 1: find all plugin directories
  const dirs = findAllPluginDirs(pluginsRoot);

  // Step 2: collect core fields for each plugin
  const byDir = new Map<string, PluginNode>();
  const parentDirs = new Map<string, string | null>();

  for (const d of dirs) {
    const collected = collectCoreFields(d, pluginsRoot);
    byDir.set(d, collected.node);
    parentDirs.set(d, collected.parentDir);
  }

  // Step 3: assemble tree — parent resolution, children, sort, hierarchy IDs
  const roots: PluginNode[] = [];
  for (const [dir, node] of byDir) {
    let parent = parentDirs.get(dir) ?? null;
    while (parent && !byDir.has(parent)) {
      const rel = relative(pluginsRoot, parent);
      const segs = rel.split(/[\\/]+/);
      if (segs.length >= 3 && segs[segs.length - 2] === "plugins") {
        parent = join(pluginsRoot, ...segs.slice(0, segs.length - 2));
      } else {
        parent = null;
      }
    }
    if (parent && byDir.has(parent)) {
      byDir.get(parent)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortRec = (list: PluginNode[]) => {
    list.sort((a, b) => a.name.localeCompare(b.name));
    for (const c of list) sortRec(c.children);
  };
  sortRec(roots);

  computeHierarchyIds(roots, "");

  const tree: PluginTree = { pluginsRoot, byDir, roots, facets: [] };

  // Step 4: barrel import + facet pipeline (unless skipped)
  if (!opts?.skipBarrelImport) {
    registerBarrelStubs(join(pluginsRoot, ".."));

    // 4a: import all barrels (web → server → central)
    const importedModules = new Map<string, { mod: Record<string, unknown>; runtime: "web" | "server" | "central" }[]>();

    // Seed web-sdk core barrel (defines Core.Root etc. — needed for slot display names)
    const webSdkCoreBarrel = join(pluginsRoot, "framework/plugins/web-sdk/core/index.ts");
    if (existsSync(webSdkCoreBarrel)) {
      const coreMod = await importBarrel(webSdkCoreBarrel);
      const webSdkDir = join(pluginsRoot, "framework/plugins/web-sdk");
      if (byDir.has(webSdkDir)) {
        importedModules.set(webSdkDir, [{ mod: coreMod, runtime: "web" }]);
      }
    }

    for (const runtime of ["web", "server", "central"] as const) {
      for (const node of byDir.values()) {
        const barrelPath = join(node.dir, runtime, "index.ts");
        if (!existsSync(barrelPath)) continue;

        const mod = await importBarrel(barrelPath);

        let mods = importedModules.get(node.dir);
        if (!mods) {
          mods = [];
          importedModules.set(node.dir, mods);
        }
        mods.push({ mod, runtime });
      }
    }

    // 4b: facet extract
    const facets = await loadFacets();
    tree.facets = facets;
    for (const node of byDir.values()) {
      const nodeModules = importedModules.get(node.dir) ?? [];
      for (const facet of facets) {
        const data = facet.extract({ dir: node.dir, importedModules: nodeModules });
        setFacet(node, facet.def, data);
      }
    }

    // 4c: facet relate
    for (const facet of facets) {
      if (facet.relate) facet.relate({ tree });
    }

    // 4d: backward-compat shim
    populateCompatFields(tree);
  }

  return tree;
}

// ── Compat shim ───────────────────────────────────────────────────

function populateCompatFields(tree: PluginTree): void {
  const f = (node: PluginNode) => node.facets;

  for (const node of tree.byDir.values()) {
    const cmds = f(node)["commands"] as CommandDef[] | undefined;
    if (cmds) node.commands = cmds;

    const slots = (f(node)["slots"] as (SlotDef & { _runtimeOnly?: boolean })[] | undefined)
      ?.filter(s => !s._runtimeOnly) as SlotDef[] | undefined;
    if (slots) node.slots = slots;

    const exps = f(node)["exports"] as Record<Runtime | "core" | "shared", { name: string; kind: "type" | "value" }[]> | undefined;
    if (exps) {
      node.exports = {
        web: exps.web.map(({ name, kind }) => ({ name, kind })),
        server: exps.server.map(({ name, kind }) => ({ name, kind })),
        central: exps.central.map(({ name, kind }) => ({ name, kind })),
        core: exps.core.map(({ name, kind }) => ({ name, kind })),
        shared: exps.shared.map(({ name, kind }) => ({ name, kind })),
      };
    }

    const routesData = f(node)["routes"] as RoutesData | undefined;
    if (routesData) {
      const routes = routesData.routes;
      node.server.httpRoutes = routes.filter(r => r.runtime === "server" && r.type === "http").map(r => r.route);
      node.server.wsRoutes = routes.filter(r => r.runtime === "server" && r.type === "ws").map(r => r.route);
      node.central.httpRoutes = routes.filter(r => r.runtime === "central" && r.type === "http").map(r => r.route);
      node.central.wsRoutes = routes.filter(r => r.runtime === "central" && r.type === "ws").map(r => r.route);
    }

    const res = f(node)["resources"] as { server: ResourceDef[]; central: ResourceDef[] } | undefined;
    if (res) {
      node.server.resources = res.server.map(r => ({ key: r.key, mode: r.mode }));
      node.central.resources = res.central.map(r => ({ key: r.key, mode: r.mode }));
    }

    const xrefs = f(node)["cross-refs"] as { apiUses: Record<string, string[]>; importedBy: string[] } | undefined;
    if (xrefs) {
      node.server.apiUses = xrefs.apiUses["server"] ?? [];
      node.central.apiUses = xrefs.apiUses["central"] ?? [];
      node.webApiUses = xrefs.apiUses["web"] ?? [];
      node.coreApiUses = xrefs.apiUses["core"] ?? [];
      node.sharedApiUses = xrefs.apiUses["shared"] ?? [];
      node.importedBy = xrefs.importedBy;
    }

    const db = f(node)["db-schema"] as { dbFiles: string[]; tables: TableDef[]; entityExtensions: EntityExtension[]; extendedBy: EntityExtensionRef[] } | undefined;
    if (db) {
      node.dbFiles = db.dbFiles;
      node.tables = db.tables;
      node.entityExtensions = db.entityExtensions;
      node.extendedBy = db.extendedBy;
    }

    const contribData = f(node)["contributions"] as ContributionsFacetData | undefined;
    if (contribData) {
      node.contributions = contribData.static;
      if (contribData.runtime.length > 0) node.runtimeContributions = contribData.runtime;
    }

    const regs = f(node)["registrations"] as DocMetaRegistration[] | undefined;
    if (regs && regs.length > 0) node.runtimeRegistrations = regs;
  }
}
