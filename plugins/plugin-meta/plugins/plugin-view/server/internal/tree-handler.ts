import {
  buildPluginTree,
  type PluginNode as TreePluginNode,
  type PluginTree,
  type BarrelExport as TreeBarrelExport,
} from "@plugins/plugin-meta/plugins/plugin-tree/shared";
import { PLUGINS_DIR } from "@plugins/infra/plugins/paths/server";
import type { BarrelExport, PluginNode, PluginTreePayload } from "../../shared/types";

function categorize(name: string, kind: "type" | "value"): "type" | "hook" | "component" | "value" {
  if (kind === "type") return "type";
  if (/^use[A-Z]/.test(name)) return "hook";
  if (/^[A-Z]/.test(name)) return "component";
  return "value";
}

function buildSymbolConsumers(tree: PluginTree): Map<string, Map<string, string[]>> {
  // pluginName -> symbolName -> [consumerPluginNames]
  const result = new Map<string, Map<string, string[]>>();
  for (const node of tree.byDir.values()) {
    for (const use of [...node.server.apiUses, ...node.central.apiUses, ...node.webApiUses, ...node.sharedApiUses]) {
      const dot = use.indexOf(".");
      if (dot < 0) continue;
      const targetPlugin = use.slice(0, dot);
      const symbol = use.slice(dot + 1);
      if (!result.has(targetPlugin)) result.set(targetPlugin, new Map());
      const bySymbol = result.get(targetPlugin)!;
      if (!bySymbol.has(symbol)) bySymbol.set(symbol, []);
      const consumers = bySymbol.get(symbol)!;
      if (!consumers.includes(node.name)) consumers.push(node.name);
    }
  }
  return result;
}

function toApiNode(node: TreePluginNode, symbolConsumers: Map<string, Map<string, string[]>>): PluginNode {
  const myConsumers = symbolConsumers.get(node.name) ?? new Map<string, string[]>();

  const mapExports = (exports: TreeBarrelExport[]): BarrelExport[] =>
    exports.map(({ name, kind }) => ({
      name,
      kind,
      category: categorize(name, kind),
      consumers: myConsumers.get(name)?.sort() ?? [],
    }));

  return {
    path: node.path,
    name: node.name,
    hierarchyId: node.hierarchyId,
    description: node.description,
    loadBearing: node.loadBearing,
    runtimes: node.runtimes,
    children: node.children.map((c) => toApiNode(c, symbolConsumers)),
    publicApi: {
      exports: {
        web: mapExports(node.exports.web),
        server: mapExports(node.exports.server),
        central: mapExports(node.exports.central),
        shared: mapExports(node.exports.shared),
      },
      importedBy: node.importedBy.sort(),
      slots: node.slots.map((s) => ({
        groupName: s.groupName,
        memberName: s.memberName,
        slotId: s.slotId,
        contributors: node.slotContributors.sort(),
      })),
      routes: [
        ...node.server.httpRoutes,
        ...node.server.wsRoutes,
        ...node.central.httpRoutes,
        ...node.central.wsRoutes,
      ].map((route) => ({
        route,
        callers: node.endpointCallers.sort(),
      })),
      resources: [...node.server.resources, ...node.central.resources],
    },
  };
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

export function handleTree(): Response {
  const tree = buildPluginTree(PLUGINS_DIR);
  const symbolConsumers = buildSymbolConsumers(tree);
  const plugins = tree.roots.map((r) => toApiNode(r, symbolConsumers));

  const totals = { plugins: 0, loadBearing: 0, umbrellas: 0 };
  for (const p of plugins) tally(p, totals);

  const payload: PluginTreePayload = { plugins, totals };
  return Response.json(payload);
}
