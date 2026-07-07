import {
  ThemeEngine,
  useTokenGroupPresets,
  useResolvedColorMode,
  type GlobalPresetContribution,
} from "@plugins/ui/plugins/theme-engine/web";

/**
 * Resolves a global theme preset into a flat `{ "--css-var": value }` map for the
 * currently-active color mode.
 *
 * It mirrors what `ThemeInjector` writes to `:root` — for each token group it
 * looks up the preset id the global preset references, reads that group preset's
 * light/dark values, and maps each token key to its `--css-var` (via the group's
 * descriptor). The difference is purely where the result is applied: the caller
 * hands it to `<ThemeScope overrides={…}/>`, which sets the vars inline on a LOCAL
 * wrapper element. So the toy restyles only its own subtree and never mutates the
 * global config or the desktop `:root` theme.
 */
export function usePresetVars(
  preset: GlobalPresetContribution | undefined,
): Record<string, string> {
  const groups = ThemeEngine.TokenGroup.useContributions();
  const mode = useResolvedColorMode();
  // Token-group contributions are static slot entries — the count is fixed across
  // renders, so calling the presets hook once per group keeps a stable hook order.
  const groupPresets = groups.map((group) => ({
    group,
    // eslint-disable-next-line react-hooks/rules-of-hooks -- static slot contribution count
    state: useTokenGroupPresets(group.id),
  }));

  const vars: Record<string, string> = {};
  if (!preset) return vars;
  for (const { group, state } of groupPresets) {
    if (state.pending) continue;
    const presetId = preset.groups[group.id];
    const groupPreset =
      state.presets.find((p) => p.id === presetId) ?? state.presets[0];
    if (!groupPreset) continue;
    const values = mode === "dark" ? groupPreset.dark : groupPreset.light;
    for (const [key, value] of Object.entries(values)) {
      const cssVar = group.descriptor.vars[key];
      if (cssVar) vars[cssVar] = value;
    }
  }
  return vars;
}
