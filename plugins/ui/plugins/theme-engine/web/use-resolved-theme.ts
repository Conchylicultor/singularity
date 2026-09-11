import { useMemo } from "react";
import { useConfigResult } from "@plugins/config_v2/web";
import {
  DEFAULT_THEME_ID,
  resolveTheme,
  themeSelectionConfig,
  type ResolvedTheme,
  type SkippedThemeValue,
  type ThemeId,
} from "../core";
import { ThemeEngine, useThemes } from "./slots";

export type ResolvedThemeState =
  | { pending: true }
  | {
      pending: false;
      /** The theme the scope paints: its selection, or Default when that selection names no theme. */
      themeId: ThemeId;
      /**
       * The selection when it names a theme that does not exist (a hand-edited
       * config file, a deleted import) — the scope paints Default instead.
       * Never silent: the painter reports it.
       */
      missing?: ThemeId;
      theme: ResolvedTheme;
      /** Persisted values the resolver dropped (a retired token group or token) — reported by the painter. */
      skipped: SkippedThemeValue[];
    };

/**
 * What scope `scopeId` paints (undefined = the desktop): its selected theme,
 * resolved over every registered token group.
 *
 * A scope without its own theme document reads the desktop's selection — the
 * inheritance is config_v2's, so this and the painter's membership gate agree.
 * Pending while the selection or any resident theme source is still loading:
 * the painter injects nothing then, so the pre-paint replayed CSS stays on
 * screen instead of being overwritten by a guess.
 */
export function useResolvedTheme(
  scopeId: string | undefined,
): ResolvedThemeState {
  const themes = useThemes();
  const selection = useConfigResult(themeSelectionConfig, { scopeId });
  const groups = ThemeEngine.TokenGroup.useContributions();

  return useMemo((): ResolvedThemeState => {
    if (themes.pending || selection.pending) return { pending: true };
    const { themesById } = themes;
    const selected = selection.data.theme;
    const exists = themesById.has(selected);
    const themeId = exists ? selected : DEFAULT_THEME_ID;
    const { theme, skipped } = resolveTheme(
      themeId,
      themesById,
      groups.map((g) => g.descriptor),
    );
    return exists
      ? { pending: false, themeId, theme, skipped }
      : { pending: false, themeId, missing: selected, theme, skipped };
  }, [themes, selection, groups]);
}
