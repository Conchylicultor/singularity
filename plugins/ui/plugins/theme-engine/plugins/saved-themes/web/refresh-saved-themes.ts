import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { hydrateEndpoint } from "@plugins/primitives/plugins/live-state/web";
import { listSavedThemes } from "../core";

/**
 * Re-read the saved-theme list into the query cache the resident source reads.
 * For code outside React that just saved a theme (an importer's `adopt`) and
 * must not hand its id back before the theme list has it — a caller selecting
 * that id would otherwise paint a missing theme for a frame. Rejects with the
 * endpoint's error.
 */
export async function refreshSavedThemes(): Promise<void> {
  const data = await fetchEndpoint(listSavedThemes, {});
  hydrateEndpoint(listSavedThemes, {}, undefined, data);
}
