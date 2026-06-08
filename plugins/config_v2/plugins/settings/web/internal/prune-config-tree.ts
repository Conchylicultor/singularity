import type { PluginNode } from "@plugins/plugin-meta/plugins/plugin-view/core";
import type { ConfigRegistration } from "@plugins/config_v2/web";

/**
 * A node of the canonical plugin tree, pruned to config-bearing branches and
 * annotated with the config registrations it carries (zero, one, or many).
 */
export interface ConfigTreeNode {
  node: PluginNode;
  /** Configs declared directly by this plugin. Empty for pure group nodes. */
  registrations: ConfigRegistration[];
  /** Already-pruned children (each contains a registration somewhere below). */
  children: ConfigTreeNode[];
}

/**
 * Prune the canonical plugin tree to only the branches that contain at least
 * one config-bearing plugin. A node is kept iff it declares config itself or
 * any descendant does.
 *
 * `byPluginId` maps a node's canonical DOT-form plugin id to the registrations
 * it declares — the caller builds it straight from `reg.pluginId`, which is
 * already dot and equals `PluginNode.id` since both derive from the same plugin
 * hierarchy (no slash→dot bridging). A plugin may declare more than one config,
 * hence an array.
 *
 * `matched` (optional) collects the plugin ids that were placed into the pruned
 * tree, so the caller can detect registrations with no matching node.
 */
export function pruneConfigTree(
  roots: PluginNode[],
  byPluginId: Map<string, ConfigRegistration[]>,
  matched?: Set<string>,
): ConfigTreeNode[] {
  const out: ConfigTreeNode[] = [];
  for (const node of roots) {
    const children = pruneConfigTree(node.children, byPluginId, matched);
    const registrations = byPluginId.get(node.id) ?? [];
    if (registrations.length > 0 || children.length > 0) {
      if (registrations.length > 0) matched?.add(node.id);
      out.push({ node, registrations, children });
    }
  }
  return out;
}
