import { viewsDescriptor } from "@plugins/primitives/plugins/data-view/plugins/view-core/server";
import type { ConfigDescriptor } from "@plugins/config_v2/core";
import { getConfig } from "@plugins/config_v2/server";
import { dataViews } from "../../shared/data-views.generated";
import { presetsExtraFields } from "../../shared/sort-presets-field";
import { customColumnsExtraFields } from "../../shared/custom-columns-field";

/**
 * The sibling config fields merged into every per-id `viewsDescriptor` — the
 * server twin of the web `extraFields` constant. ONE identity-stable module
 * constant; disjoint keys (`sortPresets` + `filterPresets` + `customColumns`),
 * so merge. Shared by the config registrations and the descriptor map below so
 * both resolve the SAME per-id `viewsDescriptor` (the cache keys by id alone).
 */
export const extraFields = { ...presetsExtraFields, ...customColumnsExtraFields };

/**
 * The reference-stable `ConfigDescriptor` per DataView id for the server runtime —
 * the server twin of the web `dataViewDescriptors`. Built off the SAME per-id
 * `viewsDescriptor` cache the config registrations use, so `getConfig(descriptor)`
 * reads the exact doc a `ConfigV2.Register` planted. This is what lets
 * `augmentServerQuery` resolve a surface's config by `dataViewId` server-side,
 * independent of the web.
 */
export const dataViewDescriptors: Map<string, ConfigDescriptor> = new Map(
  dataViews.map((v) => [v.id, viewsDescriptor(v.id, extraFields)]),
);

/**
 * Read the parsed config doc for one DataView surface by id (`views` +
 * `sortPresets` + `filterPresets` + `customColumns`), or `{}` for an
 * unregistered id (fail-soft). data-view owns the config descriptors, so this is
 * the single server-side entry point other plugins (e.g. server-query's
 * `augmentServerQuery`) use to resolve a surface's config opaquely — without
 * rebuilding the descriptor map.
 */
export function readDataViewConfigDoc(
  dataViewId: string,
): Record<string, unknown> {
  const descriptor = dataViewDescriptors.get(dataViewId);
  return descriptor ? (getConfig(descriptor) as Record<string, unknown>) : {};
}
