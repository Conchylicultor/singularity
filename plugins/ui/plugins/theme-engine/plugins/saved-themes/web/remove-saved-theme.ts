import {
  EndpointError,
  fetchEndpoint,
} from "@plugins/infra/plugins/endpoints/web";
import type { ThemeId } from "@plugins/ui/plugins/theme-engine/core";
import { whenNoScopeSelects } from "@plugins/ui/plugins/theme-engine/web";
import {
  deleteSavedTheme,
  SavedThemeInUseSchema,
  type ThemeScopeRef,
} from "../core";
import { refreshSavedThemes } from "./refresh-saved-themes";

export type RemoveSavedThemeResult =
  | { kind: "removed"; reassigned: ThemeScopeRef[] }
  | { kind: "in-use"; usedBy: ThemeScopeRef[] };

/**
 * Delete saved theme `id`, and drop it from the theme list the painter reads.
 *
 * Without `reassign`, a theme some scope still selects is left alone and the
 * result names those scopes, so the caller can ask the user before retrying
 * with `reassign` — which first moves them to the Default theme.
 *
 * The list drops the theme only once no scope on this page selects it. The
 * server moves the scopes before it deletes, but the two changes reach the page
 * separately; dropping the theme first would leave a scope, for a moment,
 * selecting a theme the list does not have — which the painter reports as a
 * missing theme. Rejects with the endpoint's error for any other failure.
 */
export async function removeSavedTheme(
  id: ThemeId,
  opts: { reassign: boolean },
): Promise<RemoveSavedThemeResult> {
  let reassigned: ThemeScopeRef[];
  try {
    ({ reassigned } = await fetchEndpoint(
      deleteSavedTheme,
      { id },
      { query: opts.reassign ? { reassign: true } : {} },
    ));
  } catch (err) {
    if (err instanceof EndpointError && err.status === 409) {
      return {
        kind: "in-use",
        usedBy: SavedThemeInUseSchema.parse(err.body).usedBy,
      };
    }
    throw err;
  }
  await whenNoScopeSelects(id);
  await refreshSavedThemes();
  return { kind: "removed", reassigned };
}
