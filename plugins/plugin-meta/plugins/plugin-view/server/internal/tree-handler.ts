import { readdirSync, type Dirent } from "fs";
import { dirname } from "path";
import {
  buildPluginTree,
  type PluginNode as TreePluginNode,
} from "@plugins/plugin-meta/plugins/plugin-tree/core";
import { standardPluginDirs } from "@plugins/framework/plugins/tooling/plugins/codegen/core";
import { PLUGINS_DIR } from "@plugins/infra/plugins/paths/server";
import { implement } from "@plugins/infra/plugins/endpoints/server";
import { getPluginTree } from "../../core/endpoints";
import type { PluginNode, PluginTreePayload } from "../../core/types";

/** Read a directory's entries, yielding [] if it is unreadable. */
function readEntries(dir: string): Dirent[] {
  try {
    return readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

/**
 * Non-source directories that must never count as plugin folders: dependencies,
 * VCS/dotfiles, and build output (`dist`, `dist.live.<pid>`, `dist.staging.<pid>`).
 * Mirrors the boundary checker's IGNORED_DIRS so the UI flags genuine structural
 * anomalies, not transient build artifacts.
 */
function isIgnoredDir(name: string): boolean {
  return name === "node_modules" || name.startsWith(".") || name.startsWith("dist");
}

function tally(
  node: PluginNode,
  totals: { plugins: number; loadBearing: number; umbrellas: number },
) {
  totals.plugins += 1;
  if (node.loadBearing) totals.loadBearing += 1;
  if (node.children.length > 0) totals.umbrellas += 1;
  for (const child of node.children) tally(child, totals);
}

export const handleTree = implement(getPluginTree, async () => {
  const tree = await buildPluginTree(PLUGINS_DIR, { skipBarrelImport: true });
  // standardPluginDirs resolves `<root>/plugins` internally, so pass the repo root.
  const std = await standardPluginDirs(dirname(PLUGINS_DIR));

  function toApiNode(node: TreePluginNode): PluginNode {
    const entries = readEntries(node.dir);
    const folders = entries
      .filter((e) => e.isDirectory() && !isIgnoredDir(e.name))
      .map((e) => ({ name: e.name, standard: std.has(e.name) }));
    const looseFiles = entries
      .filter(
        (e) => e.isFile() && (e.name.endsWith(".ts") || e.name.endsWith(".tsx")),
      )
      .map((e) => e.name);

    return {
      path: node.path,
      name: node.name,
      hierarchyId: node.hierarchyId,
      description: node.description,
      loadBearing: node.loadBearing,
      collapsed: node.collapsed,
      runtimes: node.runtimes,
      children: node.children.map(toApiNode),
      facets: node.facets,
      compositionRoot: node.compositionRoot,
      folders,
      looseFiles,
    };
  }

  const plugins = tree.roots.map(toApiNode);

  const totals = { plugins: 0, loadBearing: 0, umbrellas: 0 };
  for (const p of plugins) tally(p, totals);

  const payload: PluginTreePayload = { plugins, totals };
  return payload;
});
