import { useCallback, useState } from "react";
import { useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import { useConfigRegistrations } from "@plugins/config_v2/web";
import { setConfigField } from "@plugins/config_v2/core";
import {
  ThemeEngine,
  useThemeScopeId,
} from "@plugins/ui/plugins/theme-engine/web";
import { listTweakcnThemes } from "@plugins/ui/plugins/tweakcn/core";
import { applyCatalogTheme } from "../../core";

/** Per-token-group light/dark var maps, as the import endpoint returns them. */
export type ThemePresets = Record<
  string,
  { light: Record<string, string>; dark: Record<string, string> }
>;

/**
 * Point every token group the imported theme carries a preset for at that
 * preset. Writes land in the surrounding `ThemeScopeProvider`'s scope, so the
 * same call applies to base or to a forked app depending on the host surface.
 */
export function useApplyThemePresets() {
  const scopeId = useThemeScopeId();
  const tokenGroups = ThemeEngine.TokenGroup.useContributions();
  const registrations = useConfigRegistrations();
  const { mutate: setConfigMutation } = useEndpointMutation(setConfigField);

  return useCallback(
    (tweakcnId: string, presets: ThemePresets) => {
      const presetId = `tweakcn:${tweakcnId}`;
      for (const group of tokenGroups) {
        if (!(group.id in presets)) continue;
        const reg = registrations.find(
          (r) => r.descriptor === group.configDescriptor,
        );
        if (!reg) continue;
        setConfigMutation({
          body: scopeId
            ? { storePath: reg.storePath, key: "preset", value: presetId, scopeId }
            : { storePath: reg.storePath, key: "preset", value: presetId },
        });
      }
    },
    [scopeId, tokenGroups, registrations, setConfigMutation],
  );
}

/**
 * The full "click a catalog theme" gesture: import it server-side (which mints
 * the `tweakcn:<id>` presets), then point the token groups at them. Shared by
 * the customizer-pane gallery and the quick-switch popover so both surfaces
 * apply a theme identically.
 */
export function useApplyCatalogTheme() {
  const applyPresets = useApplyThemePresets();
  const applyMutation = useEndpointMutation(applyCatalogTheme, {
    invalidates: [listTweakcnThemes],
  });
  const [applyingId, setApplyingId] = useState<string | null>(null);

  const applyTheme = useCallback(
    (themeId: string) => {
      setApplyingId(themeId);
      applyMutation.mutate(
        { body: { themeId } },
        {
          onSuccess: (savedTheme) => {
            applyPresets(savedTheme.tweakcnId, savedTheme.presets);
            setApplyingId(null);
          },
          // The endpoint layer surfaces the failure; this only releases the
          // row's local pending state so the theme stays clickable.
          onError: () => setApplyingId(null),
        },
      );
    },
    [applyMutation, applyPresets],
  );

  return { applyingId, applyTheme, applyPresets };
}
