import type { PluginNode } from "@plugins/plugin-meta/plugins/plugin-view/core";
import type { ConfigRegistration } from "@plugins/config_v2/web";

/**
 * A node of the canonical plugin tree, pruned to config-bearing branches and
 * annotated with the config registration it carries (if any).
 */
export interface ConfigTreeNode {
  node: PluginNode;
  /** Present iff this plugin declares config. */
  registration?: ConfigRegistration;
  /** Already-pruned children (each contains a registration somewhere below). */
  children: ConfigTreeNode[];
}

/**
 * Prune the canonical plugin tree to only the branches that contain at least
 * one config-bearing plugin. A node is kept iff it declares config itself or
 * any descendant does.
 *
 * `byHierarchyId` maps a node's dotted `hierarchyId` to its registration — the
 * caller builds it from `reg.hierarchyPath.replaceAll("/", ".")`, which equals
 * `PluginNode.hierarchyId` since both derive from the same plugin hierarchy.
 *
 * `matched` (optional) collects the hierarchyIds that were placed into the
 * pruned tree, so the caller can detect registrations with no matching node.
 */
export function pruneConfigTree(
  roots: PluginNode[],
  byHierarchyId: Map<string, ConfigRegistration>,
  matched?: Set<string>,
): ConfigTreeNode[] {
  const out: ConfigTreeNode[] = [];
  for (const node of roots) {
    const children = pruneConfigTree(node.children, byHierarchyId, matched);
    const registration = byHierarchyId.get(node.hierarchyId);
    if (registration || children.length > 0) {
      if (registration) matched?.add(node.hierarchyId);
      out.push({ node, registration, children });
    }
  }
  return out;
}
