import { buildViewDescriptors } from "@plugins/primitives/plugins/data-view/plugins/view-core/web";
import { asPluginId } from "@plugins/framework/plugins/plugin-id/core";
import { dataViews } from "../../shared/data-views.generated";
import { sortPresetsExtraFields } from "../../shared/sort-presets-field";

/**
 * The per-DataView-id `views` descriptors for the web runtime. data-view owns the
 * manifest (the scraped `defineDataView(...)` id list, each entry carrying its
 * *defining* plugin id); the generic engine (view-core) builds the descriptors
 * from that id list. Each entry is then joined with its `pluginId` so the
 * `ConfigV2.WebRegister` plants the config under the consuming plugin's tree
 * (`config/<asPath(pluginId)>/<id>.jsonc`).
 *
 * `useConfig`/`useSetConfig` match a config registration by descriptor *reference
 * identity*, so the descriptor passed to `ConfigV2.WebRegister` in `web/index.ts`
 * and the one looked up by `useViewModel` MUST be the same object — both come off
 * this single `map`.
 */
const { map, entries } = buildViewDescriptors(
  dataViews.map((v) => v.id),
  sortPresetsExtraFields,
);

const pluginIdById = new Map(dataViews.map((v) => [v.id, asPluginId(v.pluginId)]));

export const dataViewDescriptors = map;
export const dataViewDescriptorEntries = entries.map((e) => ({
  ...e,
  pluginId: pluginIdById.get(e.id)!,
}));
