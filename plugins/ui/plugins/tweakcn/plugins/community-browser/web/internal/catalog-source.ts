import { useMemo } from "react";
import {
  fetchEndpoint,
  useEndpoint,
} from "@plugins/infra/plugins/endpoints/web";
import type { ThemeId } from "@plugins/ui/plugins/theme-engine/core";
import {
  useThemes,
  type ThemeSourceEntry,
} from "@plugins/ui/plugins/theme-engine/web";
import { importedThemeId } from "@plugins/ui/plugins/theme-engine/plugins/saved-themes/core";
import { refreshSavedThemes } from "@plugins/ui/plugins/theme-engine/plugins/saved-themes/web";
import { tweakcnPalettePreview } from "@plugins/ui/plugins/tweakcn/core";
import { applyCatalogTheme, getCatalog } from "../../core";

/**
 * The community catalog as browse-source entries. An entry already saved
 * carries the saved theme's id, so a picker can show it once (as the saved
 * theme) rather than twice. `undefined` while the catalog or the theme list is
 * still loading.
 *
 * The catalog's curated (tweakcn registry) themes have no tags of their own;
 * they are tagged `curated` so a picker can filter on it.
 */
export function useCatalogEntries(): ThemeSourceEntry[] | undefined {
  const catalog = useEndpoint(getCatalog, {}).data;
  const themes = useThemes();

  return useMemo(() => {
    if (!catalog || themes.pending) return undefined;
    const { themesById } = themes;
    return catalog.themes.map((theme): ThemeSourceEntry => {
      const savedId = importedThemeId("tweakcn", theme.id);
      return {
        id: theme.id,
        label: theme.name,
        tags:
          theme.source === "registry" ? ["curated", ...theme.tags] : theme.tags,
        preview: tweakcnPalettePreview(theme.cssVars),
        ...(themesById.has(savedId) ? { savedThemeId: savedId } : {}),
      };
    });
  }, [catalog, themes]);
}

/**
 * Save catalog theme `entryId` and resolve to its saved theme's id — once the
 * theme list the painter reads already has it, so the caller can select it
 * without a frame of "missing theme". Rejects with the endpoint's error.
 */
export async function adoptCatalogTheme(entryId: string): Promise<ThemeId> {
  const saved = await fetchEndpoint(
    applyCatalogTheme,
    {},
    { body: { themeId: entryId } },
  );
  await refreshSavedThemes();
  return saved.id;
}
