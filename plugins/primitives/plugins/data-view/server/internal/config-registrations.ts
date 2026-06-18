import { ConfigV2 } from "@plugins/config_v2/server";
import { asPluginId } from "@plugins/framework/plugins/plugin-id/core";
import { viewsDescriptor } from "../../shared/views-config";
import { dataViews } from "../../shared/data-views.generated";

/**
 * One `ConfigV2.Register` contribution per DataView id, all planted under the
 * `primitives.data-view` plugin. Each descriptor is built once here (server
 * runtime) so the registry's reference-keyed lookups are stable. The server's
 * descriptor identity is independent of the web's (per the views-config doc).
 *
 * Built here (not in the barrel) so `server/index.ts` stays loop-free per the
 * barrel-purity rule.
 */
const DATA_VIEW_PLUGIN_ID = asPluginId("primitives.data-view");

export const dataViewConfigRegistrations = dataViews.map((v) =>
  ConfigV2.Register({
    descriptor: viewsDescriptor(v.id),
    pluginId: DATA_VIEW_PLUGIN_ID,
  }),
);
