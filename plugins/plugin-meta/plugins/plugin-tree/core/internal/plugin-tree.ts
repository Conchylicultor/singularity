import { existsSync } from "fs";
import { readdir, readFile } from "node:fs/promises";
import { basename, join, relative } from "path";
import {
  registerBarrelStubs,
  importBarrel,
} from "@plugins/plugin-meta/plugins/barrel-import/core";
import { loadFacets, setFacet, type Facet } from "@plugins/plugin-meta/plugins/facets/core";
import { asPluginId, type PluginId } from "@plugins/framework/plugins/plugin-id/core";
import {
  stripTypes,
  parseStringField,
  parseBoolField,
} from "@plugins/plugin-meta/plugins/parse-utils/core";

async function readIfExistsAsync(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code == null) throw err;
    return null;
  }
}

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
  /** Seed flag only: `singularity.disabled === true` in this plugin's
   *  package.json. The dependent-closure cascade is derived, not stored here. */
  disabled: boolean;
  runtimes: Record<Runtime, boolean>;
  children: PluginNode[];
  facets: Record<string, unknown>;
}

export interface PluginTree {
  pluginsRoot: string;
  byDir: Map<string, PluginNode>;
  byPath: Map<string, PluginNode>;
  roots: PluginNode[];
  facets: Facet[];
}

const NESTING_SEGMENT = "plugins"; // umbrella interstitial; asFsPath joins ids with "/plugins/"

/**
 * Resolve a cross-plugin module specifier (`@plugins/<path>/<barrel>[/...]`) to its
 * unique plugin node via longest-prefix match against the real plugin-path registry.
 * Needs no runtime vocabulary: whatever exists in `byPath` is a plugin; the trailing
 * segments are the barrel suffix (any name). Returns null for a non-@plugins specifier,
 * an unknown plugin, or a specifier that nests deeper than any real plugin (next
 * segment is the literal "plugins") — callers treat the latter two as broken refs.
 */
export function resolvePluginSpecifier(
  tree: PluginTree,
  specifier: string,
): { node: PluginNode; suffix: string[] } | null {
  if (!specifier.startsWith("@plugins/")) return null;
  const parts = specifier.slice("@plugins/".length).split("/");
  let best: PluginNode | undefined;
  let bestLen = 0;
  for (let i = 1; i <= parts.length; i++) {
    const node = tree.byPath.get(parts.slice(0, i).join("/"));
    if (node && i > bestLen) {
      best = node;
      bestLen = i;
    }
  }
  if (!best) return null;
  const suffix = parts.slice(bestLen);
  if (suffix[0] === NESTING_SEGMENT) return null;
  return { node: best, suffix };
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
async function hasPluginContent(dir: string): Promise<boolean> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code == null) throw err;
    return false;
  }
  for (const e of entries) {
    if (e.isFile()) return true;
    if (e.isDirectory() && isWalkable(e.name) && (await hasPluginContent(join(dir, e.name)))) {
      return true;
    }
  }
  return false;
}

async function findAllPluginDirs(pluginsRoot: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > 10) return;
    // Purely positional: any directory visited here (other than the root itself)
    // sits at a plugin position, so it is a plugin — provided it actually holds
    // source content and isn't a hollow shell left behind by a relocation.
    if (dir !== pluginsRoot && (await hasPluginContent(dir))) out.push(dir);

    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code == null) throw err;
      return;
    }
    const subWalks: Promise<void>[] = [];
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (!isWalkable(e.name)) continue;
      if (dir === pluginsRoot) {
        subWalks.push(walk(join(dir, e.name), depth + 1));
      } else if (e.name === "plugins") {
        const sub = join(dir, e.name);
        subWalks.push(
          readdir(sub, { withFileTypes: true })
            .then((childEntries) =>
              Promise.all(
                childEntries
                  .filter((c) => c.isDirectory() && isWalkable(c.name))
                  .map((c) => walk(join(sub, c.name), depth + 1)),
              ),
            )
            .then(() => undefined)
            .catch((err) => {
              if ((err as NodeJS.ErrnoException).code != null) return;
              throw err;
            }),
        );
      }
    }
    await Promise.all(subWalks);
  }
  await walk(pluginsRoot, 0);
  return out;
}

// ── Per-plugin collection ───────────────────────────────────────────

interface CollectedPlugin {
  node: PluginNode;
  parentDir: string | null;
}

async function collectCoreFields(dir: string, pluginsRoot: string): Promise<CollectedPlugin> {
  const [webIndex, serverIndex, centralIndex, pkgSrc] = await Promise.all([
    readIfExistsAsync(join(dir, "web", "index.ts")),
    readIfExistsAsync(join(dir, "server", "index.ts")),
    readIfExistsAsync(join(dir, "central", "index.ts")),
    readIfExistsAsync(join(dir, "package.json")),
  ]);

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
  if (!description && pkgSrc) {
    try {
      const pkg = JSON.parse(pkgSrc);
      if (typeof pkg.description === "string" && pkg.description) description = pkg.description;
    // eslint-disable-next-line promise-safety/no-bare-catch
    } catch {}
  }

  const loadBearing =
    (webSrc ? parseBoolField(webSrc, "loadBearing") : false) ||
    (serverSrc ? parseBoolField(serverSrc, "loadBearing") : false) ||
    (centralSrc ? parseBoolField(centralSrc, "loadBearing") : false);

  let collapsed =
    (webSrc ? parseBoolField(webSrc, "collapsed") : false) ||
    (serverSrc ? parseBoolField(serverSrc, "collapsed") : false) ||
    (centralSrc ? parseBoolField(centralSrc, "collapsed") : false);
  // package.json collapsed, compositionRoot, and disabled markers.
  let compositionRoot = false;
  let disabled = false;
  if (pkgSrc) {
    try {
      const pkg = JSON.parse(pkgSrc);
      if (pkg.singularity?.collapsed === true) collapsed = true;
      if (pkg.singularity?.compositionRoot === true) compositionRoot = true;
      if (pkg.singularity?.disabled === true) disabled = true;
    // eslint-disable-next-line promise-safety/no-bare-catch
    } catch {}
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
      disabled,
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
  // Step 1: find all plugin directories (async fs walk — does not block event loop)
  // Sort to restore deterministic ordering (parallel walks complete in arbitrary order).
  const dirs = (await findAllPluginDirs(pluginsRoot)).sort();

  // Step 2: collect core fields for each plugin (async parallel reads)
  const byDir = new Map<string, PluginNode>();
  const byPath = new Map<string, PluginNode>();
  const parentDirs = new Map<string, string | null>();

  const collected = await Promise.all(dirs.map((d) => collectCoreFields(d, pluginsRoot)));
  for (const c of collected) {
    byDir.set(c.node.dir, c.node);
    byPath.set(c.node.path, c.node);
    parentDirs.set(c.node.dir, c.parentDir);
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

  const tree: PluginTree = { pluginsRoot, byDir, byPath, roots, facets: [] };

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
