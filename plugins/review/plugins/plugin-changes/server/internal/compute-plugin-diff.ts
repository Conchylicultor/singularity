import {
  buildPluginTree,
  type PluginNode,
} from "@plugins/plugin-meta/plugins/plugin-tree/core";
import type { EditedFile } from "@plugins/conversations/plugins/conversation-view/plugins/code/core";
import type { DiffList, PluginChangeDiff } from "../../core/protocol";

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

function diffSets(current: string[], main: string[]): DiffList {
  const mainSet = new Set(main);
  const currentSet = new Set(current);
  return {
    added: current.filter((x) => !mainSet.has(x)),
    removed: main.filter((x) => !currentSet.has(x)),
  };
}

function slotStrings(node: PluginNode): string[] {
  return node.slots.map((s) => `${s.groupName}.${s.memberName}`);
}

function contributionStrings(node: PluginNode): string[] {
  return node.contributions.map((c) => {
    const id = c.paneId ?? c.props["id"]?.replace(/^["'`]|["'`]$/g, "");
    return id ? `${c.slot} "${id}"` : c.slot;
  });
}

function exportStrings(node: PluginNode): string[] {
  const result: string[] = [];
  for (const runtime of ["web", "server", "central", "core"] as const) {
    for (const exp of node.exports[runtime]) {
      result.push(`${runtime}: ${exp.name}`);
    }
  }
  return result;
}

function routeStrings(node: PluginNode): string[] {
  return [
    ...node.server.httpRoutes,
    ...node.server.wsRoutes,
    ...node.central.httpRoutes,
    ...node.central.wsRoutes,
  ];
}

function apiUseStrings(node: PluginNode): string[] {
  return [
    ...new Set([
      ...node.server.apiUses,
      ...node.central.apiUses,
      ...node.webApiUses,
      ...node.coreApiUses,
    ]),
  ];
}

function resourceStrings(node: PluginNode): string[] {
  return [...node.server.resources, ...node.central.resources].map(
    (r) => `${r.key} (${r.mode})`,
  );
}

function tableStrings(node: PluginNode): string[] {
  return node.tables.map((t) => t.name);
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

    const empty: string[] = [];
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
      slots: diffSets(slotStrings(current), main ? slotStrings(main) : empty),
      contributions: diffSets(
        contributionStrings(current),
        main ? contributionStrings(main) : empty,
      ),
      exports: diffSets(
        exportStrings(current),
        main ? exportStrings(main) : empty,
      ),
      routes: diffSets(
        routeStrings(current),
        main ? routeStrings(main) : empty,
      ),
      apiUses: diffSets(
        apiUseStrings(current),
        main ? apiUseStrings(main) : empty,
      ),
      resources: diffSets(
        resourceStrings(current),
        main ? resourceStrings(main) : empty,
      ),
      tables: diffSets(
        tableStrings(current),
        main ? tableStrings(main) : empty,
      ),
    };

    diffs.push(diff);
  }

  diffs.sort((a, b) => a.hierarchyId.localeCompare(b.hierarchyId));
  return diffs;
}
