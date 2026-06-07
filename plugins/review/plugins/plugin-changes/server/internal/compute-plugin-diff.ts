import {
  buildPluginTree,
  type PluginNode,
} from "@plugins/plugin-meta/plugins/plugin-tree/core";
import type { EditedFile } from "@plugins/conversations/plugins/conversation-view/plugins/code/core";
import type { PluginChangeDiff } from "../../core/protocol";

function flattenTree(roots: PluginNode[]): Map<string, PluginNode> {
  const map = new Map<string, PluginNode>();
  function walk(node: PluginNode) {
    map.set(node.path, node);
    for (const child of node.children) walk(child);
  }
  for (const root of roots) walk(root);
  return map;
}

function findPluginPath(
  filePath: string,
  sortedPluginPaths: string[],
): string | null {
  if (!filePath.startsWith("plugins/")) return null;
  const rel = filePath.slice("plugins/".length);
  for (const pp of sortedPluginPaths) {
    if (rel.startsWith(pp + "/")) return pp;
  }
  return null;
}

export async function computePluginChanges(
  worktreePluginsDir: string,
  mainPluginsDir: string,
  editedFiles: EditedFile[],
): Promise<PluginChangeDiff[]> {
  const [worktreeTree, mainTree] = await Promise.all([
    buildPluginTree(worktreePluginsDir, { skipBarrelImport: true }),
    buildPluginTree(mainPluginsDir, { skipBarrelImport: true }),
  ]);

  const worktreeNodes = flattenTree(worktreeTree.roots);
  const mainNodes = flattenTree(mainTree.roots);

  // Deepest paths first so file→plugin matching picks the most specific plugin
  const pluginPaths = [...worktreeNodes.keys()].sort(
    (a, b) => b.length - a.length,
  );

  const pluginFiles = new Map<string, EditedFile[]>();
  for (const file of editedFiles) {
    const pp = findPluginPath(file.path, pluginPaths);
    if (!pp) continue;
    if (!pluginFiles.has(pp)) pluginFiles.set(pp, []);
    pluginFiles.get(pp)!.push(file);
  }

  const diffs: PluginChangeDiff[] = [];
  for (const [pluginPath, files] of pluginFiles) {
    const current = worktreeNodes.get(pluginPath);
    if (!current) continue;
    const main = mainNodes.get(pluginPath) ?? null;

    const diff: PluginChangeDiff = {
      hierarchyId: current.hierarchyId,
      name: current.name,
      path: pluginPath,
      status: main ? "modified" : "added",
      fileCount: files.length,
      additions: files.reduce((sum, f) => sum + f.additions, 0),
      deletions: files.reduce((sum, f) => sum + f.deletions, 0),
      files: files.map((f) => ({
        path: f.path,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
        ...(f.from ? { from: f.from } : {}),
      })),
      // Server is facet-blind: ship raw facet data for both sides, the client
      // computes per-facet diffs via the PluginChanges.DiffRenderer slot.
      currentFacets: current.facets,
      mainFacets: main?.facets ?? {},
    };

    diffs.push(diff);
  }

  diffs.sort((a, b) => a.hierarchyId.localeCompare(b.hierarchyId));
  return diffs;
}
