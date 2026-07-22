import { useCallback } from "react";
import { useActiveApp } from "@plugins/apps-core/web";
import { navigate } from "@plugins/apps-core/plugins/tabs/web";
import { useConfigRegistrations } from "@plugins/config_v2/web";
import type { ConfigDescriptor } from "@plugins/config_v2/core";
import { configDetailRoute } from "@plugins/config_v2/plugins/settings/web";

// Returns a navigator that jumps straight to a config descriptor's settings
// section. The descriptor is the link: it self-identifies its settings location
// through the existing ConfigV2.WebRegister registry, so no per-surface wiring
// (and no extra registry) is needed — pass the same descriptor the surface
// already reads with useConfig().
//
// This deliberately uses the cross-app `navigate()` rather than the
// surface-bound `useOpenPane()`: the config gear is baked into reusable picker
// chrome (ConfigSelectContent / ConfigMenuContent / ConfigGearButton) that can
// render OUTSIDE every pane surface — e.g. a preprompt picker inside the Improve
// popover, which mounts in the global action bar. There `useOpenPane()` throws
// (no PaneSurfaceProvider). The config chain roots in whichever app is focused
// (its panes are globally registered), mirroring the theme-customizer button.
export function useOpenConfig() {
  const registrations = useConfigRegistrations();
  const activeApp = useActiveApp();
  return useCallback(
    (descriptor: ConfigDescriptor) => {
      const reg = registrations.find((r) => r.descriptor === descriptor);
      if (!reg) {
        throw new Error(
          "useOpenConfig: descriptor is not registered via ConfigV2.WebRegister — " +
            "it has no settings section to open.",
        );
      }
      // configDetailRoute chains under configNavRoute, so `.path()` builds the
      // full `/config/cd/<configPath>` app-relative URL; prefix the focused
      // app's base path (root app → "") and navigate cross-app.
      const appBase =
        !activeApp || activeApp.path === "/" ? "" : activeApp.path;
      navigate(
        appBase +
          configDetailRoute.path({
            configPath: encodeURIComponent(reg.storePath),
          }),
      );
    },
    [registrations, activeApp],
  );
}
