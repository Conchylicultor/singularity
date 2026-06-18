import { buildViewDescriptors } from "@plugins/primitives/plugins/data-view/plugins/view-core/web";
import { dataViews } from "../../shared/data-views.generated";

/**
 * The per-DataView-id `views` descriptors for the web runtime. data-view owns the
 * manifest (the scraped `defineDataView(...)` id list); the generic engine
 * (view-core) builds the descriptors from that id list.
 *
 * `useConfig`/`useSetConfig` match a config registration by descriptor *reference
 * identity*, so the descriptor passed to `ConfigV2.WebRegister` in `web/index.ts`
 * and the one looked up by `useViewModel` MUST be the same object — both come off
 * this single `map`.
 */
const { map, entries } = buildViewDescriptors(dataViews.map((v) => v.id));

export const dataViewDescriptors = map;
export const dataViewDescriptorEntries = entries;
