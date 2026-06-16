import { asPath, asPluginId } from "@plugins/framework/plugins/plugin-id/core";
import { getAllDescriptors } from "@plugins/config_v2/server";
import type { ConfigDescriptor } from "@plugins/config_v2/core";

/**
 * The single generic gate for git promotion: derive the on-disk storePath for
 * `(pluginId, configName)` exactly the way the config_v2 registry does
 * (`config/<asPath(pluginId)>/<configName>.jsonc`), look it up among all
 * registered descriptors, and return it ONLY if it opts into git promotion
 * (`promotableToGit === true`).
 *
 * This replaces the reorder-specific `reorderableSlots.some(...)` check: a
 * runtime edit is promotable iff its descriptor is registered with
 * `promotableToGit: true`, so any future promotable config works with zero
 * staging-code changes.
 */
export function findPromotableDescriptor(
  pluginId: string,
  configName: string,
): ConfigDescriptor | null {
  const hierarchyPath = asPath(asPluginId(pluginId));
  const storePath = `${hierarchyPath}/${configName}.jsonc`;
  for (const [path, descriptor] of getAllDescriptors()) {
    if (path === storePath) {
      return descriptor.promotableToGit === true ? descriptor : null;
    }
  }
  return null;
}
