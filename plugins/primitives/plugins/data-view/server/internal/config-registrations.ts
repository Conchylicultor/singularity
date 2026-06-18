import { buildViewConfigRegistrations } from "@plugins/primitives/plugins/data-view/plugins/view-core/server";
import { asPluginId } from "@plugins/framework/plugins/plugin-id/core";
import { dataViews } from "../../shared/data-views.generated";

/**
 * One `ConfigV2.Register` contribution per DataView id, all planted under the
 * `primitives.data-view` plugin (server-side identity, independent of web). The
 * generic engine (view-core) builds the registrations from data-view's own
 * manifest id list + plugin id.
 *
 * Built here (not in the barrel) so `server/index.ts` stays loop-free per the
 * barrel-purity rule.
 */
const DATA_VIEW_PLUGIN_ID = asPluginId("primitives.data-view");

export const dataViewConfigRegistrations = buildViewConfigRegistrations(
  dataViews.map((v) => v.id),
  DATA_VIEW_PLUGIN_ID,
);
