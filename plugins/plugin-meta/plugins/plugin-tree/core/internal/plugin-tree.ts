import { existsSync, readdirSync } from "fs";
import { basename, join, relative } from "path";
import {
  registerBarrelStubs,
  importBarrel,
} from "@plugins/plugin-meta/plugins/barrel-import/core";
import { loadFacets, setFacet, type Facet } from "@plugins/plugin-meta/plugins/facets/core";
import { asPluginId, type PluginId } from "@plugins/framework/plugins/plugin-id/core";
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
  id: PluginId;
  description?: string;
  descriptions: Partial<Record<Runtime, string>>;
  loadBearing: boolean;
  collapsed: boolean;
  compositionRoot: boolean;
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

// Non-source noise skipped at every plugin position: node_modules and dot-dirs.
// This is a stable denylist that never grows — unlike the old content gate, every
// other directory at a plugin position is a plugin, irrespective of its contents.
function isWalkable(name: string): boolean {
  return name !== "node_modules" && !name.startsWith(".");
}

/**
 * A directory at a plugin position is a real plugin only if it holds source
 * content — at least one regular file somewhere under it (excluding the
 * `node_modules`/dot-dir noise `isWalkable` already skips).
 *
 * This guards against *hollow shells*: when a plugin is relocated, `git mv`
 * removes its tracked files but leaves behind the untracked `node_modules/`
 * directory git never tracked. The leftover dir lingers on disk in long-lived
 * checkouts (notably the `main` worktree where `./singularity build` runs) while
 * being absent from freshly-created worktrees. Without this gate the purely
 * positional walk resurrects each such shell as a phantom plugin, so discovery —
 * and every check/codegen step built on it — diverges between a clean worktree
 * and a cruft-laden one. That non-determinism is exactly how a branch can pass
 * `push` checks yet break `main`'s build.
 *
 * The gate stays positional (it keys on "is this a hollow shell", never on a
 * specific marker file like package.json), so a freshly authored, not-yet-
 * committed plugin — whose real `.ts` files count as content — is still found.
 */
function hasPluginContent(dir: string): boolean {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return false;
  }
  for (const e of entries) {
    if (e.isFile()) return true;
    if (e.isDirectory() && isWalkable(e.name) && hasPluginContent(join(dir, e.name))) return true;
  }
  return false;
}

function findAllPluginDirs(pluginsRoot: string): string[] {
  const out: string[] = [];
  function walk(dir: string, depth: number) {
    if (depth > 10) return;
    // Purely positional: any directory visited here (other than the root itself)
    // sits at a plugin position, so it is a plugin — provided it actually holds
    // source content and isn't a hollow shell left behind by a relocation.
    if (dir !== pluginsRoot && hasPluginContent(dir)) out.push(dir);

    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (!isWalkable(e.name)) continue;
      if (dir === pluginsRoot) walk(join(dir, e.name), depth + 1);
      else if (e.name === "plugins") {
        const sub = join(dir, e.name);
        const childEntries = readdirSync(sub, { withFileTypes: true });
        for (const c of childEntries) {
          if (c.isDirectory() && isWalkable(c.name)) walk(join(sub, c.name), depth + 1);
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
  // Read package.json once for both the collapsed and compositionRoot markers.
  let compositionRoot = false;
  {
    const pkgSrc = readIfExists(join(dir, "package.json"));
    if (pkgSrc) {
      try {
        const pkg = JSON.parse(pkgSrc);
        if (pkg.singularity?.collapsed === true) collapsed = true;
        if (pkg.singularity?.compositionRoot === true) compositionRoot = true;
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
      id: asPluginId(""),
      description,
      descriptions,
      loadBearing,
      collapsed,
      compositionRoot,
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

function computeIds(nodes: PluginNode[], parentId: string): void {
  for (const node of nodes) {
    node.id = asPluginId(parentId ? `${parentId}.${node.name}` : node.name);
    computeIds(node.children, node.id);
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

  computeIds(roots, "");

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
