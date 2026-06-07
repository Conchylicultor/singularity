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
} from "@plugins/plugin-meta/plugins/parse-utils/core";
import {
  readIfExists,
  stripTypes,
  parseStringField,
  parseBoolField,
} from "@plugins/plugin-meta/plugins/parse-utils/core";

// ── Public types ────────────────────────────────────────────────────

export type Runtime = "web" | "server" | "central";

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

  // Step 4a: barrel import (web → server → central) — gated, only the 2 runtime
  // facets (contributions runtime part, registrations) need imported modules.
  // The other 7 facets parse files from disk and populate without barrels.
  const importedModules = new Map<string, { mod: Record<string, unknown>; runtime: "web" | "server" | "central" }[]>();
  if (!opts?.skipBarrelImport) {
    registerBarrelStubs(join(pluginsRoot, ".."));

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
  }

  // Step 4b: facet extract — ALWAYS. Static facets fully populate; runtime facets
  // are partial (empty importedModules) under skipBarrelImport — acceptable.
  const facets = await loadFacets();
  tree.facets = facets;
  for (const node of byDir.values()) {
    const nodeModules = importedModules.get(node.dir) ?? [];
    for (const facet of facets) {
      const data = facet.extract({ dir: node.dir, importedModules: nodeModules });
      setFacet(node, facet.def, data);
    }
  }

  // Step 4c: facet relate — ALWAYS.
  for (const facet of facets) {
    if (facet.relate) facet.relate({ tree });
  }

  return tree;
}
