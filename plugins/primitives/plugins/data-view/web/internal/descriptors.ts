import type { ConfigDescriptor } from "@plugins/config_v2/core";
import { viewsDescriptor } from "../../shared/views-config";
import { dataViews } from "../../shared/data-views.generated";

/**
 * The ONE descriptor instance per DataView id for the web runtime.
 *
 * `useConfig`/`useSetConfig` match a config registration by descriptor
 * *reference identity* (`reg.descriptor === descriptor`). So the descriptor
 * passed to `ConfigV2.WebRegister` in `web/index.ts` and the one looked up in
 * `use-views-config.ts` MUST be the same object. Centralizing the map here —
 * imported by both — guarantees that. (`viewsDescriptor` also caches per id, so
 * this is belt-and-suspenders; the map is the canonical lookup.)
 */
export const dataViewDescriptors: Map<string, ConfigDescriptor> = new Map(
  dataViews.map((v) => [v.id, viewsDescriptor(v.id)]),
);

/** All [id, descriptor] pairs, for registration in the web barrel. */
export const dataViewDescriptorEntries: Array<{
  id: string;
  descriptor: ConfigDescriptor;
}> = dataViews.map((v) => ({
  id: v.id,
  descriptor: dataViewDescriptors.get(v.id)!,
}));
